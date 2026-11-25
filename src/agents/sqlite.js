// SQLite-backed agents. Hermes Agent is built in; any other agent with a session DB can be
// added from config with a SELECT that returns the standard columns (see docs/custom-agents.md).
import path from 'node:path';
import { HOME, IS_WIN, expandHome, exists, toMs, openSqlite, oneLine } from '../util.js';
import { PromptBag, titleFrom } from './common.js';

function hermesDb() {
  const candidates = [];
  if (process.env.HERMES_HOME) candidates.push(path.join(expandHome(process.env.HERMES_HOME), 'state.db'));
  if (IS_WIN) candidates.push(path.join(process.env.LOCALAPPDATA || path.join(HOME, 'AppData', 'Local'), 'hermes', 'state.db'));
  candidates.push(path.join(HOME, '.hermes', 'state.db'));
  return candidates.find(exists) || candidates[candidates.length - 1];
}

/** Hermes has evolved its schema a lot; select only columns that exist. */
function columns(db, table) {
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((r) => r.name));
}

export function loadHermes(file = hermesDb(), { all = false } = {}) {
  const db = openSqlite(file);
  try {
    const cols = columns(db, 'sessions');
    const pick = (name, alias = name) => (cols.has(name) ? `${name} AS ${alias}` : `NULL AS ${alias}`);
    const where = [];
    if (!all) {
      if (cols.has('source')) where.push(`source NOT IN ('cron')`);
      if (cols.has('hidden')) where.push('COALESCE(hidden,0)=0');
      if (cols.has('archived')) where.push('COALESCE(archived,0)=0');
    }
    const rows = db.prepare(`SELECT id, ${pick('source')}, ${pick('title')}, ${pick('display_name')}, ${pick('cwd')},
        ${pick('model')}, ${pick('message_count')}, ${pick('started_at')}, ${pick('last_activity_at')}, ${pick('ended_at')},
        ${pick('git_branch')}, ${pick('pinned')}
      FROM sessions ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`).all();

    const bags = new Map(rows.map((r) => [r.id, new PromptBag()]));
    const stmt = db.prepare(`SELECT session_id AS sid, substr(content, 1, 2000) AS c FROM messages WHERE role = 'user' ORDER BY id`);
    for (const m of stmt.iterate()) bags.get(m.sid)?.add(m.c);

    const out = [];
    for (const r of rows) {
      const bag = bags.get(r.id);
      if (!bag.count && !r.title) continue;
      out.push({
        id: r.id, cwd: r.cwd || '', model: r.model || '', gitBranch: r.git_branch || '',
        title: titleFrom(r.title, r.display_name, bag.first),
        startedAt: toMs(r.started_at), updatedAt: toMs(r.last_activity_at) || toMs(r.ended_at) || toMs(r.started_at),
        messages: r.message_count || bag.count,
        firstPrompt: bag.first, lastPrompt: bag.last, text: bag.text,
        tags: [r.source, r.pinned ? 'pinned' : ''].filter(Boolean),
      });
    }
    return out;
  } finally {
    db.close();
  }
}

/** Full-text check over every message (assistant + tools too), for --deep. */
export function hermesDeepIds(file, terms) {
  const db = openSqlite(file);
  try {
    const where = terms.map(() => `session_id IN (SELECT session_id FROM messages WHERE lower(content) LIKE ? ESCAPE '\\')`).join(' AND ');
    const args = terms.map((t) => `%${t.replace(/[\\%_]/g, '\\$&')}%`);
    return new Set(db.prepare(`SELECT DISTINCT session_id AS sid FROM messages WHERE ${where}`).all(...args).map((r) => r.sid));
  } finally {
    db.close();
  }
}

export const hermes = {
  name: 'hermes',
  label: 'Hermes Agent',
  command: 'hermes',
  location: hermesDb,
  detect() { return exists(hermesDb()); },
  load: (opts) => loadHermes(hermesDb(), opts),
  deepIds: (terms) => hermesDeepIds(hermesDb(), terms),
  resume: (s) => ({ command: 'hermes', args: ['--resume', s.id], cwd: s.cwd }),
};

/**
 * Generic SQLite agent from config. `query` must return at least `id`; recognised columns:
 * title, cwd, model, started_at/startedAt, updated_at/updatedAt, messages, first_prompt, text.
 */
export function sqliteAgent(spec, resumeFn) {
  const file = () => expandHome(spec.db);
  return {
    name: spec.name, label: spec.label || spec.name, command: spec.resume?.command,
    location: file,
    detect: () => exists(file()),
    load() {
      const db = openSqlite(file());
      try {
        return db.prepare(spec.query).all().map((r) => {
          const first = oneLine(r.first_prompt ?? r.firstPrompt ?? '');
          return {
            id: String(r.id), cwd: r.cwd || '', model: r.model || '',
            title: titleFrom(r.title, first),
            startedAt: toMs(r.started_at ?? r.startedAt), updatedAt: toMs(r.updated_at ?? r.updatedAt) || toMs(r.started_at ?? r.startedAt),
            messages: Number(r.messages ?? r.message_count ?? 0),
            firstPrompt: first, lastPrompt: oneLine(r.last_prompt ?? r.lastPrompt ?? ''), text: String(r.text ?? first),
          };
        });
      } finally { db.close(); }
    },
    resume: resumeFn,
  };
}
