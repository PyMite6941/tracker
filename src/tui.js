// Full-screen picker: type to filter, arrows to move, Enter to resume. No dependencies.
import path from 'node:path';
import { rank, terms } from './search.js';
import { DATE_RANGES, sinceMs, rangeLabel } from './dates.js';
import { isUnder, c, fg, bg, T, isColor, highlight, stripAnsi, fit, strWidth, timeAgo, shortPath, tildify, oneLine, agentColor } from './util.js';

const KEYS = {
  '\x1b[A': 'up', '\x1bOA': 'up', '\x10': 'up',
  '\x1b[B': 'down', '\x1bOB': 'down', '\x0e': 'down',
  '\x1b[5~': 'pgup', '\x1b[6~': 'pgdn',
  '\x1b[H': 'home', '\x1b[1~': 'home', '\x1bOH': 'home',
  '\x1b[F': 'end', '\x1b[4~': 'end', '\x1bOF': 'end',
  '\x1b[Z': 'stab', '\t': 'tab',
  '\r': 'enter', '\n': 'enter',
  '\x7f': 'bs', '\b': 'bs',
  '\x15': 'clear', '\x17': 'word',
  '\x06': 'folder', '\x14': 'date', '\x13': 'sort', '\x0f': 'print',
  '\x03': 'quit', '\x1b': 'quit',
  '\x1b[C': 'noop', '\x1b[D': 'noop',
};
const SEQS = Object.keys(KEYS).sort((a, b) => b.length - a.length);

/** Split a raw stdin chunk into key names / literal text. Exported for tests. */
export function parseKeys(chunk) {
  const out = [];
  let i = 0;
  while (i < chunk.length) {
    const seq = SEQS.find((s) => chunk.startsWith(s, i) && (s !== '\x1b' || chunk.length === i + 1 || !'[O'.includes(chunk[i + 1])));
    if (seq) { out.push(KEYS[seq]); i += seq.length; continue; }
    if (chunk[i] === '\x1b') { // unknown escape sequence: swallow it
      const m = /^\x1b[[O][0-9;]*[ -/]*[@-~]/.exec(chunk.slice(i));
      i += m ? m[0].length : 1;
      continue;
    }
    const cp = chunk.codePointAt(i);
    const ch = String.fromCodePoint(cp);
    if (cp >= 32) out.push({ text: ch });
    i += ch.length;
  }
  return out;
}

/**
 * Open the picker. Resolves { action: 'resume' | 'print' | 'quit', session }.
 * `sessions` is the full list (newest first); `here` is the cwd used by the folder filter.
 */
export function pick(sessions, { query = '', agent = 'all', here = process.cwd(), folderOnly = false, since = 'any', stdin = process.stdin, stdout = process.stdout } = {}) {
  const agentNames = ['all', ...[...new Set(sessions.map((s) => s.agent))].sort()];
  const st = {
    query, sel: 0, top: 0, folderOnly,
    agentIdx: Math.max(0, agentNames.indexOf(agent)),
    dateIdx: 0,
    sort: 'auto', list: [],
  };
  const inFolder = (s) => isUnder(s.cwd, here);

  // ^T cycles these; a custom --since value (e.g. 2026-11-01) joins the cycle right after "any".
  const ranges = DATE_RANGES.includes(String(since).toLowerCase()) ? DATE_RANGES : ['any', String(since), ...DATE_RANGES.slice(1)];
  st.dateIdx = Math.max(0, ranges.indexOf(String(since).toLowerCase()));

  const refilter = () => {
    const a = agentNames[st.agentIdx];
    const from = sinceMs(ranges[st.dateIdx]);
    let pool = sessions.filter((s) => (a === 'all' || s.agent === a) && (!st.folderOnly || inFolder(s)) && (!from || (s.updatedAt || 0) >= from));
    const ranked = rank(pool, st.query);
    st.list = st.sort === 'recent' ? ranked.sort((x, y) => y.updatedAt - x.updatedAt) : ranked;
    st.sel = Math.min(st.sel, Math.max(0, st.list.length - 1));
  };

  const chip = (label, value, on) => (isColor()
    ? bg(T.chipBg)(` ${T.muted(label)} ${on ? T.accent(c.bold(value)) : T.text(value)} `)
    : `${label}:${value}`);
  const key = (k, label) => `${isColor() ? bg(T.keyBg)(T.text(` ${k} `)) : k} ${T.muted(label)}`;
  const rule = (W, label = '') => T.faint(label ? `── ${label} ${'─'.repeat(Math.max(0, W - strWidth(label) - 4))}` : '─'.repeat(W));

  const draw = () => {
    const W = Math.max(50, stdout.columns || 100);
    const H = Math.max(14, stdout.rows || 30);
    const previewH = 7; // box: top border, 5 rows, bottom border
    const listH = H - 3 - previewH - 1;
    if (st.sel < st.top) st.top = st.sel;
    if (st.sel >= st.top + listH) st.top = st.sel - listH + 1;
    const ts = terms(st.query);

    const lines = [];
    // ── header: brand + counts on the left, filter chips on the right
    const a = agentNames[st.agentIdx];
    const sortName = st.sort === 'auto' ? (st.query ? 'relevance' : 'recent') : st.sort;
    const chips = [chip('agent', a, a !== 'all'), chip('date', rangeLabel(ranges[st.dateIdx]), st.dateIdx !== 0), chip('folder', st.folderOnly ? 'here' : 'any', st.folderOnly), chip('sort', sortName, false)].join(' ');
    const brand = isColor() ? bg(24)(c.bold(fg(255)(' ◆ tracker '))) : '[tracker]';
    const count = T.muted(`${st.list.length === sessions.length ? '' : `${st.list.length} of `}${sessions.length} sessions`);
    const head = ` ${brand} ${count}`;
    lines.push(head + ' '.repeat(Math.max(1, W - strWidth(head) - strWidth(chips) - 1)) + chips);

    // ── search line
    const prompt = T.accent(' ❯ ');
    const cursor = isColor() ? c.inverse(' ') : '_';
    const q = st.query ? T.text(st.query) + cursor : cursor + T.faint(' search titles, prompts, folders, ids…');
    const pos = st.list.length ? T.faint(`${st.sel + 1}/${st.list.length} `) : '';
    const left = ` ${prompt}${q}`;
    lines.push(left + ' '.repeat(Math.max(1, W - 1 - strWidth(left) - strWidth(pos))) + pos);
    lines.push(rule(W - 1));

    // ── list
    const agentW = 9, ageW = 8, folderW = Math.min(28, Math.floor(W * 0.24));
    // Every line stays one column short of W so no terminal auto-wraps on the last cell.
    const titleW = W - 1 - 3 - 2 - agentW - 1 - ageW - 1 - folderW - 2;
    for (let r = 0; r < listH; r++) {
      const s = st.list[st.top + r];
      if (!s) {
        lines.push(r === 0 && !st.list.length ? T.muted('   no matching sessions — try fewer words, Tab for agent, ^T for date range, ^F to toggle folder') : '');
        continue;
      }
      const on = st.top + r === st.sel;
      const hue = agentColor(s.agent);
      const title = highlight(fit(s.title, titleW), ts);
      const row = `${on ? hue(' ▌ ') : '   '}${hue('●')} ${hue(fit(s.agent, agentW))} ${T.muted(fit(timeAgo(s.updatedAt), ageW))} ` +
        `${on ? c.bold(T.text(title)) : title}  ${T.faint(fit(shortPath(s.cwd), folderW))}`;
      lines.push(on && isColor() ? `\x1b[48;5;${T.selBg}m${row}\x1b[K\x1b[49m` : row);
    }

    // ── preview box
    const s = st.list[st.sel];
    const inner = W - 6; // ' │ ' + inner + ' │' = W - 1
    const boxRow = (txt) => `${T.faint(' │')} ${txt}${' '.repeat(Math.max(0, inner - strWidth(txt)))} ${T.faint('│')}`;
    const field = (k, v) => boxRow(`${T.muted(k.padEnd(7))}${fit(v, inner - 7, { pad: false })}`);
    const titleTxt = s ? ` ${fit(s.title, Math.max(10, W - 12), { pad: false })} ` : '';
    lines.push(T.faint(' ╭─') + (s ? c.bold(T.text(titleTxt)) : '') + T.faint('─'.repeat(Math.max(0, W - 5 - strWidth(titleTxt))) + '╮'));
    if (s) {
      const meta = [`${agentColor(s.agent)('●')} ${agentColor(s.agent)(s.agent)}`, `${s.messages || 0} msgs`, timeAgo(s.updatedAt), s.model, s._deep ? T.warn('matched in transcript') : '']
        .filter(Boolean).join(T.faint('  ·  '));
      lines.push(boxRow(strWidth(meta) <= inner ? meta : T.muted(fit(stripAnsi(meta), inner, { pad: false }))));
      lines.push(field('folder', tildify(s.cwd) || '(unknown)'));
      lines.push(field('first', oneLine(s.firstPrompt)));
      lines.push(field('last', oneLine(s.lastPrompt)));
      lines.push(field('id', s.id));
    } else {
      for (let i = 0; i < 5; i++) lines.push(boxRow(''));
    }
    lines.push(T.faint(' ╰' + '─'.repeat(W - 4) + '╯'));

    // ── key hints
    lines.push(' ' + [key('↑↓', 'move'), key('⏎', 'resume'), key('⇥', 'agent'), key('^T', 'date'), key('^F', 'folder'), key('^S', 'sort'), key('^O', 'print'), key('esc', 'quit')].join('  '));

    stdout.write('\x1b[H' + lines.slice(0, H).map((l) => l + '\x1b[K').join('\r\n') + '\x1b[J');
  };

  return new Promise((resolve) => {
    let done = false;
    const finish = (action) => {
      if (done) return;
      done = true;
      stdin.off('data', onData);
      stdout.off('resize', draw);
      try { stdin.setRawMode(false); } catch { /* not a tty */ }
      stdin.pause();
      stdout.write('\x1b[?25h\x1b[?1049l');
      resolve({ action, session: st.list[st.sel] });
    };
    const onData = (buf) => {
      for (const k of parseKeys(buf.toString('utf8'))) {
        const page = Math.max(1, (stdout.rows || 30) - 10);
        if (typeof k === 'object') { st.query += k.text; st.sel = 0; refilter(); continue; }
        switch (k) {
          case 'up': st.sel = Math.max(0, st.sel - 1); break;
          case 'down': st.sel = Math.min(st.list.length - 1, st.sel + 1); break;
          case 'pgup': st.sel = Math.max(0, st.sel - page); break;
          case 'pgdn': st.sel = Math.min(st.list.length - 1, st.sel + page); break;
          case 'home': st.sel = 0; break;
          case 'end': st.sel = Math.max(0, st.list.length - 1); break;
          case 'tab': st.agentIdx = (st.agentIdx + 1) % agentNames.length; st.sel = 0; refilter(); break;
          case 'stab': st.agentIdx = (st.agentIdx - 1 + agentNames.length) % agentNames.length; st.sel = 0; refilter(); break;
          case 'date': st.dateIdx = (st.dateIdx + 1) % ranges.length; st.sel = 0; refilter(); break;
          case 'folder': st.folderOnly = !st.folderOnly; st.sel = 0; refilter(); break;
          case 'sort': st.sort = st.sort === 'recent' ? 'auto' : 'recent'; st.sel = 0; refilter(); break;
          case 'bs': st.query = [...st.query].slice(0, -1).join(''); refilter(); break;
          case 'word': st.query = st.query.replace(/\S+\s*$/, ''); refilter(); break;
          case 'clear': st.query = ''; refilter(); break;
          case 'enter': if (st.list[st.sel]) return finish('resume'); break;
          case 'print': if (st.list[st.sel]) return finish('print'); break;
          case 'quit': return finish('quit');
        }
      }
      draw();
    };

    refilter();
    stdout.write('\x1b[?1049h\x1b[?25l');
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
    stdout.on('resize', draw);
    draw();
  });
}
