// Keyword ranking. Every term must match somewhere (AND); where it matches sets the weight.
import fs from 'node:fs';
import path from 'node:path';

export function terms(query) {
  return String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
}

const W = { id: 20, title: 6, folder: 4, cwd: 2, first: 2, last: 2, text: 1, agent: 3 };

/** Score one session against terms; 0 means "not a match". */
export function score(s, ts) {
  if (!ts.length) return 1;
  const title = (s.title || '').toLowerCase();
  const cwd = (s.cwd || '').toLowerCase();
  const folder = path.basename(cwd.replace(/[\\/]+$/, ''));
  const first = (s.firstPrompt || '').toLowerCase();
  const last = (s.lastPrompt || '').toLowerCase();
  const text = (s.text || '').toLowerCase();
  const id = (s.id || '').toLowerCase();
  let total = 0;
  for (const t of ts) {
    let w = 0;
    if (id.startsWith(t) && t.length >= 4) w += W.id;
    if (s.agent === t) w += W.agent;
    if (title.includes(t)) w += W.title + (new RegExp(`\\b${escapeRe(t)}\\b`).test(title) ? 2 : 0);
    if (folder.includes(t)) w += W.folder;
    else if (cwd.includes(t)) w += W.cwd;
    if (first.includes(t)) w += W.first;
    if (last.includes(t)) w += W.last;
    if (text.includes(t)) w += W.text;
    if (s._deep) w += 0.5; // matched inside the full transcript
    if (!w) return 0;
    total += w;
  }
  const phrase = ts.join(' ');
  if (ts.length > 1 && (title.includes(phrase) || text.includes(phrase))) total += 4;
  return total;
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/**
 * Rank sessions. Recency breaks ties and lightly boosts fresh sessions so "the one from
 * this morning" beats an equally-matching one from March.
 */
export function rank(sessions, query, { now = Date.now() } = {}) {
  const ts = terms(query);
  if (!ts.length) return sessions.slice();
  const scored = [];
  for (const s of sessions) {
    const sc = score(s, ts);
    if (!sc) continue;
    const days = Math.max(0, (now - s.updatedAt) / 86400000);
    scored.push({ s, sc: sc + 3 / (1 + days) });
  }
  scored.sort((a, b) => b.sc - a.sc || b.s.updatedAt - a.s.updatedAt);
  return scored.map((x) => x.s);
}

/**
 * --deep: find sessions whose *full* transcript (assistant replies, tool output) contains every
 * term. File agents are grepped raw; SQLite agents run a query. Marks hits with `_deep`.
 */
export function deepMatch(sessions, agents, query) {
  const ts = terms(query);
  if (!ts.length) return sessions;
  const byName = new Map(agents.map((a) => [a.name, a]));
  const dbHits = new Map();
  for (const a of agents) {
    if (a.deepIds) { try { dbHits.set(a.name, a.deepIds(ts)); } catch { /* ignore */ } }
  }
  for (const s of sessions) {
    s._deep = false; // flags from an earlier query must not leak into this one
    if (score(s, ts)) continue; // already matches on summary data
    const hits = dbHits.get(s.agent);
    if (hits) { if (hits.has(s.id)) s._deep = true; continue; }
    if (!s.file || !byName.get(s.agent)) continue;
    try {
      const raw = fs.readFileSync(s.file, 'utf8').toLowerCase();
      if (ts.every((t) => raw.includes(t))) s._deep = true;
    } catch { /* ignore */ }
  }
  return sessions;
}
