// OpenCode: SQLite at $XDG_DATA_HOME/opencode/opencode.db (session / message / part tables).
import path from 'node:path';
import { HOME, expandHome, exists, toMs, openSqlite } from '../util.js';
import { PromptBag, titleFrom } from './common.js';

export function opencodeDb() {
  if (process.env.OPENCODE_DATA_DIR) return path.join(expandHome(process.env.OPENCODE_DATA_DIR), 'opencode.db');
  const base = process.env.XDG_DATA_HOME ? expandHome(process.env.XDG_DATA_HOME) : path.join(HOME, '.local', 'share');
  return path.join(base, 'opencode', 'opencode.db');
}

const cols = (db, t) => new Set(db.prepare(`PRAGMA table_info(${t})`).all().map((r) => r.name));

export function loadOpencode(file = opencodeDb(), { all = false } = {}) {
  const db = openSqlite(file);
  try {
    const c = cols(db, 'session');
    const where = [];
    if (!all) {
      if (c.has('parent_id')) where.push('parent_id IS NULL'); // subagent children can't be resumed on their own
      if (c.has('time_archived')) where.push('time_archived IS NULL');
    }
    const rows = db.prepare(`SELECT id, title, directory, ${c.has('model') ? 'model' : 'NULL AS model'}, time_created, time_updated
      FROM session ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`).all();
    const bags = new Map(rows.map((r) => [r.id, new PromptBag()]));
    const counts = new Map();
    for (const m of db.prepare(`SELECT session_id AS sid, json_extract(data, '$.role') AS role FROM message`).iterate()) {
      counts.set(m.sid, (counts.get(m.sid) || 0) + 1);
    }
    const parts = db.prepare(`SELECT p.session_id AS sid, substr(json_extract(p.data, '$.text'), 1, 2000) AS t
      FROM part p JOIN message m ON m.id = p.message_id
      WHERE json_extract(m.data, '$.role') = 'user' AND json_extract(p.data, '$.type') = 'text'
        AND COALESCE(json_extract(p.data, '$.synthetic'), 0) = 0
      ORDER BY p.time_created`);
    for (const p of parts.iterate()) bags.get(p.sid)?.add(p.t);

    const out = [];
    for (const r of rows) {
      const bag = bags.get(r.id);
      if (!bag.count) continue;
      // OpenCode's placeholder title until it auto-names the session.
      const title = /^New session - \d{4}-/.test(r.title || '') ? '' : r.title;
      let model = '';
      try { const m = JSON.parse(r.model || 'null'); model = m?.modelID || m?.id || ''; } catch { model = r.model || ''; }
      out.push({
        id: r.id, cwd: r.directory ? path.normalize(r.directory) : '', model,
        title: titleFrom(title, bag.first),
        startedAt: toMs(r.time_created), updatedAt: toMs(r.time_updated) || toMs(r.time_created),
        messages: counts.get(r.id) || bag.count,
        firstPrompt: bag.first, lastPrompt: bag.last, text: bag.text,
      });
    }
    return out;
  } finally {
    db.close();
  }
}

export function opencodeDeepIds(file, terms) {
  const db = openSqlite(file);
  try {
    const where = terms.map(() => `id IN (SELECT session_id FROM part WHERE lower(data) LIKE ? ESCAPE '\\')`).join(' AND ');
    const args = terms.map((t) => `%${t.replace(/[\\%_]/g, '\\$&')}%`);
    return new Set(db.prepare(`SELECT id AS sid FROM session WHERE ${where}`).all(...args).map((r) => r.sid));
  } finally {
    db.close();
  }
}

export default {
  name: 'opencode',
  label: 'OpenCode',
  command: 'opencode',
  location: opencodeDb,
  detect: () => exists(opencodeDb()),
  load: (opts) => loadOpencode(opencodeDb(), opts),
  deepIds: (terms) => opencodeDeepIds(opencodeDb(), terms),
  resume: (s) => ({ command: 'opencode', args: ['--session', s.id], cwd: s.cwd }),
};
