import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { makeHome, withEnv, T0 } from './fixtures.js';
import { loadAgents, readConfig } from '../src/agents/index.js';
import { collect } from '../src/store.js';
import { rank, deepMatch } from '../src/search.js';
import { resumeSpec, shellLine } from '../src/resume.js';
import { cleanPrompt } from '../src/agents/common.js';
import { fit, strWidth, glob, toMs, isUnder } from '../src/util.js';
import { parseKeys, pick } from '../src/tui.js';
import { parseArgs } from '../src/cli.js';

const BIN = fileURLToPath(new URL('../bin/tracker.js', import.meta.url));
let H;
before(() => { H = makeHome(); });
after(() => { fs.rmSync(H.root, { recursive: true, force: true }); });

const scan = (opts = {}) => withEnv(H.env, () => {
  const { agents } = loadAgents({ config: readConfig(H.env.TRACKER_CONFIG) });
  return { agents, ...collect(agents, opts) };
});
const cli = (args, extraEnv = {}) => spawnSync(process.execPath, [BIN, ...args, '--no-color'], {
  env: { ...process.env, ...H.env, ...extraEnv, NO_COLOR: '1' }, encoding: 'utf8',
});

test('finds one session per built-in agent, newest first', () => {
  const { sessions, stats } = scan();
  assert.deepEqual(sessions.map((s) => s.agent), ['hermes', 'gemini', 'codex', 'claude']);
  assert.equal(stats.qwen.found, false);
  assert.ok(sessions.every((s, i) => i === 0 || sessions[i - 1].updatedAt >= s.updatedAt));
});

test('claude: title, prompts, filters noise, skips stubs/subagents/headless', () => {
  const { sessions } = scan();
  const s = sessions.find((x) => x.agent === 'claude');
  assert.equal(s.id, 'aaaa1111-0000-4000-8000-000000000001');
  assert.equal(s.title, 'Stripe refund webhook');
  assert.equal(s.cwd, H.proj);
  assert.equal(s.model, 'claude-opus-5-5');
  assert.equal(s.firstPrompt, 'Add a Stripe webhook handler for refunds');
  assert.equal(s.lastPrompt, 'now write tests for it');
  assert.equal(s.startedAt, T0);
  assert.equal(s.updatedAt, T0 + 5 * 60000);
  assert.ok(!s.text.includes('ignore me') && !s.text.includes('meta noise') && !s.text.includes('subagent'));
  assert.equal(sessions.filter((x) => x.agent === 'claude').length, 1);
  assert.equal(scan({ all: true }).sessions.filter((x) => x.agent === 'claude').length, 2);
});

test('codex: uses event user_message, ignores injected context', () => {
  const s = scan().sessions.find((x) => x.agent === 'codex');
  assert.equal(s.id, 'bbbb1111-0000-4000-8000-000000000001');
  assert.equal(s.firstPrompt, 'Fix the navbar overflow on mobile');
  assert.equal(s.cwd, H.web);
  assert.equal(s.model, 'gpt-5-codex');
});

test('gemini: maps project dir to cwd through projects.json', () => {
  const s = scan().sessions.find((x) => x.agent === 'gemini');
  assert.equal(s.id, 'cccc1111-0000-4000-8000-000000000001');
  assert.equal(s.cwd.toLowerCase(), H.web.toLowerCase());
  assert.equal(s.title, 'Explain the CSS grid layout');
});

test('hermes: hides cron + hidden unless --all', () => {
  const ids = scan().sessions.filter((s) => s.agent === 'hermes').map((s) => s.id);
  assert.deepEqual(ids, ['local-dddd1111']);
  const all = scan({ all: true }).sessions.filter((s) => s.agent === 'hermes').map((s) => s.id).sort();
  assert.deepEqual(all, ['local-dddd1111', 'local-dddd2222', 'local-dddd3333']);
});

test('cache: second scan reads nothing, touched file is re-parsed', () => {
  scan();
  const second = scan();
  assert.equal(second.stats.claude.parsed, 0);
  assert.ok(second.stats.claude.cached >= 1);
  const f = path.join(H.env.CLAUDE_CONFIG_DIR, 'projects', 'enc-payments', 'aaaa1111-0000-4000-8000-000000000001.jsonl');
  fs.appendFileSync(f, JSON.stringify({ type: 'custom-title', customTitle: 'Refunds v2' }) + '\n');
  const third = scan();
  assert.equal(third.stats.claude.parsed, 1);
  assert.equal(third.sessions.find((s) => s.agent === 'claude').title, 'Refunds v2');
});

test('search: AND semantics, title beats body, folder names count', () => {
  const { sessions } = scan();
  assert.equal(rank(sessions, 'stripe')[0].agent, 'claude');
  assert.equal(rank(sessions, 'navbar mobile')[0].agent, 'codex');
  assert.equal(rank(sessions, 'stripe navbar').length, 0);
  const pay = rank(sessions, 'payments').map((s) => s.agent).sort();
  assert.deepEqual(pay, ['claude', 'hermes']);
});

test('deep search reaches assistant text in files and sqlite', () => {
  const { sessions, agents } = scan();
  assert.equal(rank(sessions, 'zebra').length, 0);
  withEnv(H.env, () => deepMatch(sessions, agents, 'zebra'));
  assert.equal(rank(sessions, 'zebra')[0].agent, 'claude');
  withEnv(H.env, () => deepMatch(sessions, agents, 'pelican'));
  assert.equal(rank(sessions, 'pelican').length, 1);
  assert.equal(rank(sessions, 'pelican')[0].agent, 'hermes');
});

test('resume commands per agent', () => {
  const { sessions, agents } = scan();
  const by = Object.fromEntries(sessions.map((s) => [s.agent, resumeSpec(s, agents)]));
  assert.deepEqual([by.claude.command, ...by.claude.args], ['claude', '--resume', 'aaaa1111-0000-4000-8000-000000000001']);
  assert.deepEqual([by.codex.command, ...by.codex.args], ['codex', 'resume', 'bbbb1111-0000-4000-8000-000000000001']);
  assert.deepEqual([by.gemini.command, ...by.gemini.args], ['gemini', '--resume', 'cccc1111-0000-4000-8000-000000000001']);
  assert.deepEqual([by.hermes.command, ...by.hermes.args], ['hermes', '--resume', 'local-dddd1111']);
  assert.equal(by.claude.cwd, H.proj);
  assert.equal(shellLine({ command: 'x', args: ['--resume', 'a b'], cwd: '/p q' }, { win: false }), "cd '/p q' && x --resume 'a b'");
  assert.equal(shellLine({ command: 'x', args: ['id'], cwd: 'C:\\a b' }, { win: true }), 'cd /d "C:\\a b" && x id');
});

test('missing cwd falls back to current dir and flags it', () => {
  const { agents } = scan();
  const spec = resumeSpec({ agent: 'claude', id: 'x', cwd: path.join(H.root, 'gone') }, agents);
  assert.equal(spec.cwd, process.cwd());
  assert.equal(spec.cwdMissing, true);
});

test('custom agents from config (jsonl + sqlite) and disable', () => {
  const dir = path.join(H.root, 'myagent');
  fs.mkdirSync(path.join(dir, 'logs'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'logs', 'sess-42.jsonl'), [
    { role: 'user', content: 'Refactor the kangaroo module', ts: '2026-01-10T12:00:00Z', dir: H.web },
    { role: 'assistant', content: 'ok', ts: '2026-01-10T12:05:00Z' },
  ].map((r) => JSON.stringify(r)).join('\n'));
  fs.writeFileSync(H.env.TRACKER_CONFIG, JSON.stringify({
    disable: ['gemini'],
    agents: [
      { name: 'mine', format: 'jsonl', glob: path.join(dir, '**', '*.jsonl'),
        fields: { id: '$filename', cwd: 'dir', timestamp: 'ts' }, resume: { command: 'mine', args: ['--session', '{id}'] } },
      { name: 'dbagent', format: 'sqlite', db: path.join(H.env.HERMES_HOME, 'state.db'),
        query: "SELECT id, title, cwd, started_at, last_activity_at AS updated_at FROM sessions WHERE source='cron'",
        resume: { command: 'dbagent', args: ['{id}'] } },
      { name: 'broken', format: 'xml' },
    ],
  }));
  try {
    const { sessions, agents } = scan();
    const { errors } = withEnv(H.env, () => loadAgents({ config: readConfig(H.env.TRACKER_CONFIG) }));
    assert.ok(errors.some((e) => e.includes('broken')));
    assert.ok(!sessions.some((s) => s.agent === 'gemini'));
    const m = sessions.find((s) => s.agent === 'mine');
    assert.equal(m.id, 'sess-42');
    assert.equal(m.title, 'Refactor the kangaroo module');
    assert.equal(m.updatedAt, Date.parse('2026-01-10T12:05:00Z'));
    assert.deepEqual(resumeSpec(m, agents).args, ['--session', 'sess-42']);
    const d = sessions.find((s) => s.agent === 'dbagent');
    assert.equal(d.title, 'Nightly digest');
  } finally {
    fs.unlinkSync(H.env.TRACKER_CONFIG);
  }
});

test('CLI: list, last --print, resume by keyword, show --json, agents --json', () => {
  const list = cli(['list']);
  assert.equal(list.status, 0, list.stderr);
  assert.match(list.stdout, /Stripe refund webhook|Refunds v2/);
  const last = cli(['last', 'codex', '--print']);
  assert.equal(last.status, 0, last.stderr);
  assert.match(last.stdout, /codex resume bbbb1111-0000-4000-8000-000000000001/);
  const res = cli(['resume', 'database', 'migration', '--print']);
  assert.match(res.stdout, /hermes --resume local-dddd1111/);
  const byPrefix = cli(['resume', 'cccc1111', '--print']);
  assert.match(byPrefix.stdout, /gemini --resume cccc1111/);
  const show = JSON.parse(cli(['show', 'navbar', '--json']).stdout);
  assert.equal(show.agent, 'codex');
  assert.equal(show.text, undefined);
  const agents = JSON.parse(cli(['agents', '--json']).stdout);
  assert.deepEqual(agents.filter((a) => a.found).map((a) => a.name).sort(), ['claude', 'codex', 'gemini', 'hermes']);
  const bad = cli(['resume', 'nothing-matches-this']);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /nothing matches/);
  assert.equal(cli(['--version']).stdout.trim(), JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url))).version);
});

test('TUI: type, move, Enter resumes the highlighted session', async () => {
  const { sessions } = scan();
  const stdin = Object.assign(new EventEmitter(), { setRawMode() {}, resume() {}, pause() {} });
  let screen = '';
  const stdout = Object.assign(new EventEmitter(), { columns: 100, rows: 30, write: (s) => { screen += s; } });
  const p = pick(sessions, { stdin, stdout });
  stdin.emit('data', Buffer.from('pay'));     // claude + hermes (payments-api folder)
  assert.match(screen, /2\/4 sessions/);
  stdin.emit('data', Buffer.from('\x1b[B'));  // down
  stdin.emit('data', Buffer.from('\r'));
  const res = await p;
  assert.equal(res.action, 'resume');
  assert.equal(res.session.agent, rank(sessions, 'pay')[1].agent);
});

test('TUI: Tab filters by agent, Esc quits', async () => {
  const { sessions } = scan();
  const stdin = Object.assign(new EventEmitter(), { setRawMode() {}, resume() {}, pause() {} });
  let screen = '';
  const stdout = Object.assign(new EventEmitter(), { columns: 100, rows: 30, write: (s) => { screen += s; } });
  const p = pick(sessions, { stdin, stdout });
  stdin.emit('data', Buffer.from('\t'));
  assert.match(screen, /agent:claude/);
  stdin.emit('data', Buffer.from('\x1b'));
  assert.equal((await p).action, 'quit');
});

test('helpers', () => {
  assert.deepEqual(parseKeys('ab\x1b[A\r\x1b'), [{ text: 'a' }, { text: 'b' }, 'up', 'enter', 'quit']);
  assert.deepEqual(parseKeys('\x1b[1;5C'), []);
  assert.equal(strWidth('ドキュメント'), 12);
  assert.equal(strWidth(fit('ドキュメント/portfolio', 10)), 10);
  assert.equal(cleanPrompt('<command-name>/clear</command-name>'), '');
  assert.equal(cleanPrompt('<command-name>/review</command-name><command-args>PR 12</command-args>'), '/review PR 12');
  assert.equal(toMs(1795435986.07), 1795435986070);
  assert.equal(toMs('2026-01-10T10:00:00Z'), T0);
  assert.equal(glob(path.join(H.env.CODEX_HOME, 'sessions', '**', 'rollout-*.jsonl')).length, 1);
  assert.deepEqual(parseArgs(['-a', 'claude,hermes', 'resume', 'foo', '--print']).agents, ['claude', 'hermes']);
  assert.throws(() => parseArgs(['--nope']), /unknown option/);
  assert.equal(isUnder(path.join(H.root, 'work', 'website'), path.join(H.root, 'work', 'web')), false);
  assert.equal(isUnder(path.join(H.root, 'work', 'web', 'src'), path.join(H.root, 'work', 'web')), true);
  assert.equal(isUnder(H.web, H.web + path.sep), true);
});
