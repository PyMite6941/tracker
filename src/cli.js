// Command-line entry: parse args, dispatch commands.
import fs from 'node:fs';
import path from 'node:path';
import { loadAgents, readConfig } from './agents/index.js';
import { collect, clearCache } from './store.js';
import { rank, deepMatch, terms } from './search.js';
import { resumeSpec, shellLine, run, which } from './resume.js';
import { isUnder, c, T, highlight, setColor, fit, timeAgo, shortPath, tildify, oneLine, agentColor, configPath, cacheDir } from './util.js';
import { EXAMPLE_CONFIG } from './example-config.js';
import { sinceMs, filterSince } from './dates.js';

export const VERSION = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const HELP = `${c.bold('tracker')} — find and resume your AI coding-agent sessions

${c.bold('Usage')}
  tracker                      interactive picker (type to search, Enter to resume)
  tracker <keywords…>          picker pre-filtered by keywords
  tracker last [agent]         resume the most recent session
  tracker resume <id|words>    resume a session by id, id prefix, or best keyword match
  tracker list [words]         print sessions (newest first, or ranked by words)
  tracker show <id|words>      details + first/last prompts for one session
  tracker agents               which agents were found, where, and how many sessions
  tracker config [--init]      show config path, or write an example config
  tracker reindex              drop the cache and rescan everything

${c.bold('Options')}
  -a, --agent <name>   only these agents (repeat or comma-separate): claude,codex,gemini,qwen,hermes,…
  -H, --here           only sessions started in (or under) the current directory
  -s, --since <when>   only sessions active since: today, yesterday, 24h, 7d, 2w, 3m, YYYY-MM-DD
  -t, --today          same as --since today
  -n, --limit <n>      rows for list (default 20)
      --deep           also search full transcripts (assistant replies, tool output)
      --all            include hidden/archived/cron sessions where agents track them
      --print          print the resume command instead of running it
      --json           machine-readable output (list, show, agents, last --print)
      --no-cache       ignore the index cache for this run
      --no-color       plain output (also honours NO_COLOR)
  -h, --help / -v, --version

${c.bold('Examples')}
  tracker last claude              pick up your latest Claude Code session
  tracker resume stripe webhook    resume the session that best matches "stripe webhook"
  tracker -H                       sessions for the project you're standing in
  tracker list --since 7d -a hermes  this week's Hermes sessions
  cd "$(tracker last --print --json | jq -r .cwd)"
`;

const COMMANDS = new Set(['list', 'ls', 'search', 's', 'last', 'resume', 'r', 'show', 'agents', 'config', 'reindex', 'help', 'version']);

export function parseArgs(argv) {
  const o = { cmd: '', rest: [], agents: [], limit: 20, here: false, since: '', deep: false, all: false, print: false, json: false, noCache: false, color: undefined, help: false, version: false, init: false };
  const need = (i, flag) => { if (i >= argv.length) throw new Error(`${flag} needs a value`); return argv[i]; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { o.rest.push(...argv.slice(i + 1)); break; }
    const [flag, inline] = a.startsWith('--') && a.includes('=') ? [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)] : [a, undefined];
    switch (flag) {
      case '-a': case '--agent': o.agents.push(...(inline ?? need(++i, flag)).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)); break;
      case '-n': case '--limit': o.limit = Number(inline ?? need(++i, flag)); if (!(o.limit > 0)) throw new Error('--limit must be a positive number'); break;
      case '-H': case '--here': o.here = true; break;
      case '-s': case '--since': o.since = inline ?? need(++i, flag); sinceMs(o.since); break;
      case '-t': case '--today': o.since = 'today'; break;
      case '--deep': o.deep = true; break;
      case '--all': o.all = true; break;
      case '--print': case '--dry-run': o.print = true; break;
      case '--json': o.json = true; break;
      case '--no-cache': o.noCache = true; break;
      case '--no-color': o.color = false; break;
      case '--color': o.color = true; break;
      case '--init': o.init = true; break;
      case '-h': case '--help': o.help = true; break;
      case '-v': case '--version': o.version = true; break;
      default:
        if (a.startsWith('-') && a.length > 1) throw new Error(`unknown option ${a} (see tracker --help)`);
        if (!o.cmd && !o.rest.length && COMMANDS.has(a)) o.cmd = a;
        else o.rest.push(a);
    }
  }
  return o;
}

function load(o) {
  const { agents, errors, configFile, config } = loadAgents({ config: readConfig() });
  for (const e of errors) process.stderr.write(c.yellow(`tracker: config: ${e}\n`));
  const known = new Set(agents.map((a) => a.name));
  for (const n of o.agents) if (!known.has(n)) throw new Error(`unknown agent "${n}" — known: ${[...known].join(', ')}`);
  const active = o.agents.length ? agents.filter((a) => o.agents.includes(a.name)) : agents;
  const onProgress = process.stderr.isTTY && !o.json
    ? (agent, n) => process.stderr.write(c.dim(`indexing up to ${n} ${agent.label} transcripts (first run is slow; later runs only re-read what changed)…
`))
    : undefined;
  const res = collect(active, { all: o.all, noCache: o.noCache, onProgress, config });
  if (process.env.TRACKER_DEBUG) for (const w of res.warnings) process.stderr.write(c.dim(`warn: ${w}\n`));
  let sessions = res.sessions;
  if (o.here) {
    sessions = sessions.filter((s) => isUnder(s.cwd, process.cwd()));
  }
  return { agents, active, sessions, stats: res.stats, configFile };
}

function find(sessions, agents, words, o) {
  const q = words.join(' ').trim();
  if (!q) return sessions[0];
  const lc = q.toLowerCase();
  const exact = sessions.find((s) => s.id.toLowerCase() === lc);
  if (exact) return exact;
  if (lc.length >= 4 && !lc.includes(' ')) {
    const pref = sessions.filter((s) => s.id.toLowerCase().startsWith(lc) || s.id.toLowerCase().replace(/^local-/, '').startsWith(lc));
    if (pref.length === 1) return pref[0];
  }
  if (o.deep) deepMatch(sessions, agents, q);
  return rank(sessions, q)[0];
}

const publicView = (s) => {
  const { text, _deep, ...rest } = s;
  return { ...rest, deepMatch: Boolean(_deep) || undefined };
};

function printTable(list, total, query = '') {
  const W = Math.max(60, process.stdout.columns || 110) - 1;
  const folderW = Math.min(26, Math.floor(W * 0.22));
  // " NNN  ● agent____ age_____ title… folder…  id______"
  const titleW = W - 5 - 2 - 9 - 1 - 8 - 1 - 2 - folderW - 2 - 8;
  const ts = terms(query);
  if (list.length && process.stdout.isTTY) {
    process.stdout.write(T.faint(`${'#'.padStart(4)}  ${fit('agent', 11)} ${fit('updated', 8)} ${fit('title', titleW)}  ${fit('folder', folderW)}  id`) + '\n');
  }
  list.forEach((s, i) => {
    const hue = agentColor(s.agent);
    process.stdout.write(
      `${T.faint(String(i + 1).padStart(4))}  ${hue('●')} ${hue(fit(s.agent, 9))} ${T.muted(fit(timeAgo(s.updatedAt), 8))} ` +
      `${highlight(fit(s.title, titleW), ts)}  ${T.faint(fit(shortPath(s.cwd), folderW))}  ${T.faint(s.id.replace(/^(local-|ses_)/, '').slice(0, 8))}\n`);
  });
  if (!list.length) process.stdout.write(T.muted('no sessions found — run `tracker agents` to see what was detected\n'));
  else if (total > list.length) process.stdout.write(T.faint(`      … ${total - list.length} more · narrow with keywords, -a <agent>, -H, or raise -n\n`));
}

async function doResume(session, agents, o) {
  const spec = resumeSpec(session, agents);
  if (o.print) {
    if (o.json) process.stdout.write(JSON.stringify({ ...publicView(session), resume: { command: spec.command, args: spec.args, cwd: spec.cwd, shell: shellLine(spec) } }, null, 2) + '\n');
    else process.stdout.write(shellLine(spec) + '\n');
    return 0;
  }
  const hue = agentColor(session.agent);
  process.stderr.write(`${T.accent('↻')} ${hue('●')} ${hue(session.agent)} ${c.bold(T.text(oneLine(session.title)))}\n  ${T.faint(tildify(spec.cwd))}\n\n`);
  if (spec.cwdMissing) process.stderr.write(T.warn(`  original folder ${tildify(spec.originalCwd)} no longer exists — launching here instead\n`));
  return run(spec);
}

export async function main(argv = process.argv.slice(2)) {
  const o = parseArgs(argv);
  if (o.color !== undefined) setColor(o.color);
  if (o.version || o.cmd === 'version') { process.stdout.write(VERSION + '\n'); return 0; }
  if (o.help || o.cmd === 'help') { process.stdout.write(HELP); return 0; }

  switch (o.cmd) {
    case 'reindex': {
      clearCache();
      const { sessions, stats } = load({ ...o, noCache: true });
      process.stdout.write(`indexed ${sessions.length} sessions across ${Object.values(stats).filter((s) => s.found).length} agents\n`);
      return 0;
    }
    case 'config': {
      const file = configPath();
      if (o.init) {
        if (fs.existsSync(file)) { process.stderr.write(`${file} already exists — not overwriting\n`); return 1; }
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(EXAMPLE_CONFIG, null, 2) + '\n');
        process.stdout.write(`wrote example config to ${file}\n`);
        return 0;
      }
      process.stdout.write(`config: ${file}${fs.existsSync(file) ? '' : c.dim(' (not created — tracker config --init)')}\ncache:  ${cacheDir()}\n`);
      return 0;
    }
    case 'agents': {
      const { agents, stats } = load({ ...o, here: false });
      const rows = agents.filter((a) => !o.agents.length || o.agents.includes(a.name)).map((a) => ({
        name: a.name, label: a.label, custom: Boolean(a.custom), found: stats[a.name]?.found || false,
        sessions: stats[a.name]?.sessions || 0, location: stats[a.name]?.location || '', command: a.command, onPath: Boolean(a.command && which(a.command)),
      }));
      if (o.json) { process.stdout.write(JSON.stringify(rows, null, 2) + '\n'); return 0; }
      process.stdout.write('\n');
      for (const r of rows) {
        const hue = agentColor(r.name);
        const mark = r.found ? hue('●') : T.faint('○');
        const n = r.sessions;
        const count = r.found ? (n ? T.text : T.muted)(String(n).padStart(4)) + T.muted(n === 1 ? ' session ' : ' sessions') : T.faint('   not found ');
        const cmd = r.onPath ? T.ok('✓ ') + T.muted(fit(r.command, 13)) : T.warn('✗ ') + T.warn(fit(r.command, 13));
        process.stdout.write(`  ${mark} ${(r.found ? c.bold : (x) => x)(hue(fit(r.name, 9)))} ${T.text(fit(r.label + (r.custom ? ' (custom)' : ''), 20))} ${count}   ${cmd} ${T.faint(tildify(r.location))}\n`);
      }
      const total = rows.reduce((n, r) => n + r.sessions, 0);
      process.stdout.write(`\n  ${T.muted(`${total} sessions across ${rows.filter((r) => r.sessions).length} agents · ✓/✗ = command on PATH`)}\n\n`);
      return 0;
    }
  }

  const { agents, sessions: everything } = load(o);
  const sessions = filterSince(everything, o.since);

  switch (o.cmd) {
    case 'list': case 'ls': case 'search': case 's': {
      const q = o.rest.join(' ');
      if (o.deep && q) deepMatch(sessions, agents, q);
      const ranked = q ? rank(sessions, q) : sessions;
      const shown = ranked.slice(0, o.limit);
      if (o.json) process.stdout.write(JSON.stringify(shown.map(publicView), null, 2) + '\n');
      else printTable(shown, ranked.length, q);
      return 0;
    }
    case 'last': {
      const filtered = o.rest.length ? sessions.filter((s) => o.rest.map((x) => x.toLowerCase()).includes(s.agent)) : sessions;
      if (o.rest.length && !filtered.length && !agents.some((a) => o.rest.includes(a.name))) throw new Error(`unknown agent "${o.rest.join(' ')}"`);
      if (!filtered[0]) throw new Error('no sessions found');
      return doResume(filtered[0], agents, o);
    }
    case 'resume': case 'r': {
      if (!o.rest.length) throw new Error('usage: tracker resume <id | keywords>');
      const s = find(sessions, agents, o.rest, o);
      if (!s) throw new Error(`nothing matches "${o.rest.join(' ')}" — try tracker list ${o.rest.join(' ')} --deep`);
      return doResume(s, agents, o);
    }
    case 'show': {
      const s = find(sessions, agents, o.rest, o);
      if (!s) throw new Error('no matching session');
      const spec = resumeSpec(s, agents);
      if (o.json) { process.stdout.write(JSON.stringify({ ...publicView(s), resume: shellLine(spec) }, null, 2) + '\n'); return 0; }
      const row = (k, v) => process.stdout.write(`  ${T.muted(k.padEnd(9))}${v}\n`);
      const hue = agentColor(s.agent);
      process.stdout.write(`\n  ${hue('●')} ${c.bold(T.text(oneLine(s.title)))}\n`);
      process.stdout.write(`  ${T.faint('─'.repeat(Math.min(60, Math.max(20, (process.stdout.columns || 80) - 4))))}\n`);
      row('agent', hue(s.agent));
      row('id', s.id);
      row('folder', tildify(s.cwd) || '(unknown)');
      row('updated', `${timeAgo(s.updatedAt)}  ${T.faint(new Date(s.updatedAt).toLocaleString())}`);
      row('started', T.text(new Date(s.startedAt).toLocaleString()));
      row('messages', String(s.messages || 0));
      if (s.model) row('model', s.model);
      if (s.gitBranch) row('branch', s.gitBranch);
      if (s.file) row('file', T.faint(tildify(s.file)));
      row('first', oneLine(s.firstPrompt).slice(0, 300));
      row('last', oneLine(s.lastPrompt).slice(0, 300));
      process.stdout.write(`\n  ${T.muted('resume')}   ${T.accent(shellLine(spec))}\n\n`);
      return 0;
    }
  }

  // Default: picker (TTY) or a ranked list (pipes/CI).
  const q = o.rest.join(' ');
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    const ranked = q ? rank(sessions, q) : sessions;
    if (o.json) process.stdout.write(JSON.stringify(ranked.slice(0, o.limit).map(publicView), null, 2) + '\n');
    else printTable(ranked.slice(0, o.limit), ranked.length, q);
    return 0;
  }
  if (o.deep && q) deepMatch(everything, agents, q);
  const { pick } = await import('./tui.js');
  // The picker gets everything so ^T can widen the date range again; --since only sets where it starts.
  const res = await pick(everything, { query: q, agent: o.agents.length === 1 ? o.agents[0] : 'all', since: o.since || 'any' });
  if (res.action === 'quit' || !res.session) return 0;
  return doResume(res.session, agents, { ...o, print: res.action === 'print' || o.print });
}
