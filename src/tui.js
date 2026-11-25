// Full-screen picker: type to filter, arrows to move, Enter to resume. No dependencies.
import path from 'node:path';
import { rank } from './search.js';
import { isUnder, c, fit, strWidth, timeAgo, shortPath, tildify, oneLine, agentColor } from './util.js';

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
  '\x06': 'folder', '\x13': 'sort', '\x0f': 'print',
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
export function pick(sessions, { query = '', agent = 'all', here = process.cwd(), folderOnly = false, stdin = process.stdin, stdout = process.stdout } = {}) {
  const agentNames = ['all', ...[...new Set(sessions.map((s) => s.agent))].sort()];
  const st = {
    query, sel: 0, top: 0, folderOnly,
    agentIdx: Math.max(0, agentNames.indexOf(agent)),
    sort: 'auto', list: [],
  };
  const inFolder = (s) => isUnder(s.cwd, here);

  const refilter = () => {
    const a = agentNames[st.agentIdx];
    let pool = sessions.filter((s) => (a === 'all' || s.agent === a) && (!st.folderOnly || inFolder(s)));
    const ranked = rank(pool, st.query);
    st.list = st.sort === 'recent' ? ranked.sort((x, y) => y.updatedAt - x.updatedAt) : ranked;
    st.sel = Math.min(st.sel, Math.max(0, st.list.length - 1));
  };

  const draw = () => {
    const W = Math.max(40, stdout.columns || 100);
    const H = Math.max(12, stdout.rows || 30);
    const previewH = 6;
    const listH = H - 3 - previewH - 1;
    if (st.sel < st.top) st.top = st.sel;
    if (st.sel >= st.top + listH) st.top = st.sel - listH + 1;

    const lines = [];
    const a = agentNames[st.agentIdx];
    const tags = [
      `agent:${c.bold(a)}`,
      st.folderOnly ? c.green('folder:here') : c.dim('folder:any'),
      `sort:${st.sort === 'auto' ? (st.query ? 'relevance' : 'recent') : st.sort}`,
    ].join('  ');
    const head = `${c.bold(c.cyan(' tracker'))} ${c.dim(`${st.list.length}/${sessions.length} sessions`)}`;
    lines.push(head + ' '.repeat(Math.max(1, W - strWidth(head) - strWidth(tags) - 1)) + tags);
    lines.push(`${c.cyan(' ❯')} ${st.query}${c.inverse(' ')}`);
    lines.push(c.dim('─'.repeat(W)));

    const agentW = 7, ageW = 8, folderW = Math.min(26, Math.floor(W * 0.25));
    const titleW = W - 3 - agentW - 1 - ageW - 1 - folderW - 1;
    for (let r = 0; r < listH; r++) {
      const s = st.list[st.top + r];
      if (!s) { lines.push(r === 0 ? c.dim('   no matching sessions — try fewer words, Tab to change agent, Ctrl-F to toggle folder') : ''); continue; }
      const on = st.top + r === st.sel;
      const row = `${on ? c.cyan(' ▸ ') : '   '}${agentColor(s.agent)(fit(s.agent, agentW))} ${c.dim(fit(timeAgo(s.updatedAt), ageW))} ` +
        `${on ? c.bold(fit(s.title, titleW)) : fit(s.title, titleW)} ${c.gray(fit(shortPath(s.cwd), folderW))}`;
      lines.push(on ? `\x1b[48;5;236m${row}\x1b[K\x1b[49m` : row);
    }

    lines.push(c.dim('─'.repeat(W)));
    const s = st.list[st.sel];
    const pv = [];
    if (s) {
      pv.push(`${c.bold(fit(s.title, W - 2, { pad: false }))}`);
      pv.push(c.dim(fit(`${s.agent} · ${s.id} · ${s.messages || 0} msgs${s.model ? ' · ' + s.model : ''}${s._deep ? ' · matched in transcript' : ''}`, W - 2, { pad: false })));
      pv.push(c.dim('dir   ') + fit(tildify(s.cwd) || '(unknown)', W - 8, { pad: false }));
      pv.push(c.dim('first ') + fit(oneLine(s.firstPrompt), W - 8, { pad: false }));
      pv.push(c.dim('last  ') + fit(oneLine(s.lastPrompt), W - 8, { pad: false }));
    }
    while (pv.length < previewH - 1) pv.push('');
    lines.push(...pv.map((l) => ' ' + l));
    lines.push(c.dim(' ↑↓ move · Enter resume · Tab agent · ^F this folder · ^S sort · ^O print cmd · Esc quit'));

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
