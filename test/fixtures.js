// Builds a throwaway home directory with one session per built-in agent, and points every
// agent at it through environment variables. No real user data is touched.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadSqlite } from '../src/util.js';

export const T0 = Date.parse('2026-01-10T10:00:00Z');
const iso = (mins) => new Date(T0 + mins * 60000).toISOString();

export function makeHome() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tracker-test-'));
  const proj = path.join(root, 'work', 'payments-api');
  const web = path.join(root, 'work', 'website');
  fs.mkdirSync(proj, { recursive: true });
  fs.mkdirSync(web, { recursive: true });
  const write = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
  const jsonl = (rows) => rows.map((r) => JSON.stringify(r)).join('\n') + '\n';

  // --- Claude Code ---
  const cdir = path.join(root, 'claude', 'projects', 'enc-payments');
  write(path.join(cdir, 'aaaa1111-0000-4000-8000-000000000001.jsonl'), jsonl([
    { type: 'permission-mode', permissionMode: 'default', sessionId: 'aaaa1111-0000-4000-8000-000000000001' },
    { type: 'user', cwd: proj, entrypoint: 'cli', sessionId: 'aaaa1111-0000-4000-8000-000000000001', timestamp: iso(0), message: { role: 'user', content: '<command-name>/clear</command-name><command-args></command-args>' } },
    { type: 'user', cwd: proj, timestamp: iso(1), message: { role: 'user', content: 'Add a Stripe webhook handler for refunds <system-reminder>ignore me</system-reminder>' } },
    { type: 'assistant', cwd: proj, timestamp: iso(2), message: { role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text: 'Sure — I will verify signatures with the zebra-secret.' }] } },
    { type: 'user', cwd: proj, timestamp: iso(3), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x', content: 'ok' }] } },
    { type: 'user', cwd: proj, timestamp: iso(4), isMeta: true, message: { role: 'user', content: 'meta noise' } },
    { type: 'ai-title', aiTitle: 'Stripe refund webhook', sessionId: 'aaaa1111-0000-4000-8000-000000000001' },
    { type: 'user', cwd: proj, timestamp: iso(5), message: { role: 'user', content: [{ type: 'text', text: 'now write tests for it' }] } },
  ]));
  // headless (claude -p) session: hidden unless --all
  write(path.join(cdir, 'aaaa2222-0000-4000-8000-000000000002.jsonl'), jsonl([
    { type: 'user', cwd: proj, entrypoint: 'sdk-cli', timestamp: iso(6), message: { role: 'user', content: 'Classify this request' } },
  ]));
  // metadata-only stub: not a session
  write(path.join(cdir, 'aaaa3333-0000-4000-8000-000000000003.jsonl'), jsonl([{ type: 'mode', mode: 'normal' }]));
  // subagent transcript: must be ignored
  write(path.join(cdir, 'aaaa1111-0000-4000-8000-000000000001', 'subagents', 'agent-1.jsonl'), jsonl([
    { type: 'user', cwd: proj, timestamp: iso(7), message: { role: 'user', content: 'subagent prompt' } },
  ]));

  // --- Codex ---
  write(path.join(root, 'codex', 'sessions', '2026', '01', '10', 'rollout-2026-01-10T10-20-00-bbbb1111-0000-4000-8000-000000000001.jsonl'), jsonl([
    { timestamp: iso(20), type: 'session_meta', payload: { id: 'bbbb1111-0000-4000-8000-000000000001', timestamp: iso(20), cwd: web } },
    { timestamp: iso(20), type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '<environment_context>cwd</environment_context>' }] } },
    { timestamp: iso(21), type: 'event_msg', payload: { type: 'user_message', message: 'Fix the navbar overflow on mobile' } },
    { timestamp: iso(22), type: 'turn_context', payload: { model: 'gpt-5-codex', cwd: web } },
    { timestamp: iso(23), type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'done' }] } },
  ]));

  // --- Gemini (short-name project dir mapped via projects.json) ---
  const gem = path.join(root, 'gemini');
  write(path.join(gem, 'projects.json'), JSON.stringify({ projects: { [web.toLowerCase()]: 'website' } }));
  write(path.join(gem, 'tmp', 'website', 'chats', 'session-2026-01-10T11-00-cccc1111.json'), JSON.stringify({
    sessionId: 'cccc1111-0000-4000-8000-000000000001', projectHash: 'x', startTime: iso(60), lastUpdated: iso(65),
    messages: [
      { type: 'info', content: 'login required' },
      { type: 'user', content: [{ text: 'Explain the CSS grid layout' }] },
      { type: 'gemini', content: 'Grid works like…', model: 'gemini-3-pro' },
    ],
  }));

  // --- Hermes (SQLite) ---
  const hdir = path.join(root, 'hermes');
  fs.mkdirSync(hdir, { recursive: true });
  const { DatabaseSync } = loadSqlite();
  const db = new DatabaseSync(path.join(hdir, 'state.db'));
  db.exec(`CREATE TABLE sessions (id TEXT PRIMARY KEY, source TEXT NOT NULL, title TEXT, cwd TEXT, model TEXT,
    message_count INTEGER, started_at REAL NOT NULL, last_activity_at REAL, ended_at REAL, hidden INTEGER DEFAULT 0, archived INTEGER DEFAULT 0);
    CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT, role TEXT, content TEXT, timestamp REAL);`);
  const ins = db.prepare('INSERT INTO sessions (id, source, title, cwd, model, message_count, started_at, last_activity_at, hidden) VALUES (?,?,?,?,?,?,?,?,?)');
  ins.run('local-dddd1111', 'local', 'Plan the database migration', proj, 'nemotron', 4, (T0 + 90 * 60000) / 1000, (T0 + 95 * 60000) / 1000, 0);
  ins.run('local-dddd2222', 'cron', 'Nightly digest', proj, 'nemotron', 2, (T0 + 100 * 60000) / 1000, (T0 + 100 * 60000) / 1000, 0);
  ins.run('local-dddd3333', 'local', 'Hidden one', proj, 'nemotron', 2, (T0 + 30 * 60000) / 1000, (T0 + 30 * 60000) / 1000, 1);
  const msg = db.prepare('INSERT INTO messages (session_id, role, content, timestamp) VALUES (?,?,?,?)');
  msg.run('local-dddd1111', 'user', 'how do we migrate postgres to the new schema', T0 / 1000);
  msg.run('local-dddd1111', 'assistant', 'Use a blue-green rollout with the pelican flag.', T0 / 1000);
  msg.run('local-dddd2222', 'user', 'digest', T0 / 1000);
  db.close();

  const env = {
    CLAUDE_CONFIG_DIR: path.join(root, 'claude'),
    CODEX_HOME: path.join(root, 'codex'),
    GEMINI_DIR: gem,
    QWEN_DIR: path.join(root, 'qwen'),
    HERMES_HOME: hdir,
    OPENCODE_DATA_DIR: path.join(root, 'opencode'),
    CURSOR_DIR: path.join(root, 'cursor'),
    COPILOT_HOME: path.join(root, 'copilot'),
    TRACKER_CACHE_DIR: path.join(root, 'cache'),
    TRACKER_CONFIG: path.join(root, 'config.json'),
  };

  // --- OpenCode (SQLite: session / message / part) ---
  fs.mkdirSync(env.OPENCODE_DATA_DIR, { recursive: true });
  const oc = new DatabaseSync(path.join(env.OPENCODE_DATA_DIR, 'opencode.db'));
  oc.exec(`CREATE TABLE session (id TEXT PRIMARY KEY, parent_id TEXT, directory TEXT NOT NULL, title TEXT NOT NULL, model TEXT,
      time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL, time_archived INTEGER);
    CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL, data TEXT NOT NULL);
    CREATE TABLE part (id TEXT PRIMARY KEY, message_id TEXT NOT NULL, session_id TEXT NOT NULL, time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL, data TEXT NOT NULL);`);
  const ocS = oc.prepare('INSERT INTO session VALUES (?,?,?,?,?,?,?,?)');
  ocS.run('ses_main', null, proj.replace(/\\/g, '/'), 'New session - 2026-01-10T12:00:00.000Z', JSON.stringify({ modelID: 'big-pickle' }), T0 + 115 * 60000, T0 + 120 * 60000, null);
  ocS.run('ses_child', 'ses_main', proj, 'Explore codebase (@explore subagent)', null, T0 + 116 * 60000, T0 + 117 * 60000, null);
  ocS.run('ses_old', null, proj, 'Archived chat', null, T0, T0 + 1, T0 + 2);
  const ocM = oc.prepare('INSERT INTO message VALUES (?,?,?,?,?)');
  const ocP = oc.prepare('INSERT INTO part VALUES (?,?,?,?,?,?)');
  ocM.run('m1', 'ses_main', 1, 1, JSON.stringify({ role: 'user' }));
  ocP.run('p1', 'm1', 'ses_main', 1, 1, JSON.stringify({ type: 'text', text: 'Make the emulators work for the koala app' }));
  ocP.run('p1b', 'm1', 'ses_main', 2, 2, JSON.stringify({ type: 'text', text: 'injected file contents', synthetic: true }));
  ocM.run('m2', 'ses_main', 3, 3, JSON.stringify({ role: 'assistant' }));
  ocP.run('p2', 'm2', 'ses_main', 3, 3, JSON.stringify({ type: 'text', text: 'Use the walrus emulator image.' }));
  ocM.run('m3', 'ses_child', 4, 4, JSON.stringify({ role: 'user' }));
  ocP.run('p3', 'm3', 'ses_child', 4, 4, JSON.stringify({ type: 'text', text: 'explore' }));
  ocM.run('m4', 'ses_old', 5, 5, JSON.stringify({ role: 'user' }));
  ocP.run('p4', 'm4', 'ses_old', 5, 5, JSON.stringify({ type: 'text', text: 'old' }));
  oc.close();

  // --- Cursor Agent CLI ---
  const cchat = path.join(env.CURSOR_DIR, 'chats', 'abc123hash', 'eeee1111-0000-4000-8000-000000000001');
  write(path.join(cchat, 'meta.json'), JSON.stringify({ schemaVersion: 1, createdAtMs: T0 + 145 * 60000, hasConversation: true, title: 'Navbar Refactor', updatedAtMs: T0 + 150 * 60000, cwd: web }));
  write(path.join(cchat, 'prompt_history.json'), JSON.stringify(['refactor the navbar into components', 'add a dark mode toggle']));
  write(path.join(env.CURSOR_DIR, 'chats', 'abc123hash', 'eeee2222-0000-4000-8000-000000000002', 'meta.json'), JSON.stringify({ hasConversation: false }));

  // --- GitHub Copilot CLI ---
  write(path.join(env.COPILOT_HOME, 'session-state', 'ffff1111-0000-4000-8000-000000000001.jsonl'), jsonl([
    { type: 'session.start', timestamp: iso(175), data: { sessionId: 'ffff1111-0000-4000-8000-000000000001', selectedModel: 'gpt-5', context: { cwd: proj } } },
    { type: 'user.message', timestamp: iso(176), data: { content: 'Write a Dockerfile for the payments api' } },
    { type: 'assistant.message', timestamp: iso(180), data: { content: 'Here it is' } },
  ]));

  // --- Qwen Code, newer projects/<cwd>/chats/<id>.jsonl layout ---
  const qchats = path.join(env.QWEN_DIR, 'projects', 'c--work-website', 'chats');
  write(path.join(qchats, '9999aaaa-0000-4000-8000-000000000001.jsonl'), jsonl([
    { uuid: 'u1', parentUuid: null, sessionId: '9999aaaa-0000-4000-8000-000000000001', timestamp: iso(205), type: 'user', message: { role: 'user', parts: [{ text: 'Add lazy loading to the gallery images' }] } },
    { uuid: 'u2', parentUuid: 'u1', sessionId: '9999aaaa-0000-4000-8000-000000000001', timestamp: iso(210), type: 'assistant', message: { role: 'model', parts: [{ text: 'ok' }] } },
  ]));
  write(path.join(qchats, '9999aaaa-0000-4000-8000-000000000001.runtime.json'), JSON.stringify({ session_id: '9999aaaa-0000-4000-8000-000000000001', work_dir: web }));

  // --- Aider: history file in a project folder another agent already knows about ---
  const aiderFile = path.join(web, '.aider.chat.history.md');
  write(aiderFile, [
    '', '# aider chat started at 2026-01-10 13:50:00', '',
    '> aider --model ollama_chat/qwen2.5-coder:7b  ', '> Main model: ollama_chat/qwen2.5-coder:7b', '',
    '#### write a sitemap generator', '', 'Sure, here is sitemap.py', '',
    '# aider chat started at 2026-01-10 13:55:00', '',
    '#### also add robots.txt', '',
  ].join('\n'));
  const at = new Date(T0 + 240 * 60000);
  fs.utimesSync(aiderFile, at, at);

  return { root, proj, web, env };
}

export function withEnv(env, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(env)) { saved[k] = process.env[k]; process.env[k] = v; }
  try { return fn(); } finally {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
}
