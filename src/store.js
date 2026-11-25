// Session index: scans every agent, caches parsed file-based sessions by (mtime, size) so
// re-runs only re-read transcripts that changed.
import fs from 'node:fs';
import path from 'node:path';
import { cacheDir } from './util.js';

const CACHE_VERSION = 4;
const cacheFile = () => path.join(cacheDir(), 'index.json');

function readCache() {
  try {
    const d = JSON.parse(fs.readFileSync(cacheFile(), 'utf8'));
    return d.version === CACHE_VERSION ? d : { version: CACHE_VERSION, files: {} };
  } catch {
    return { version: CACHE_VERSION, files: {} };
  }
}

function writeCache(cache) {
  try {
    fs.mkdirSync(cacheDir(), { recursive: true });
    const tmp = cacheFile() + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(cache));
    fs.renameSync(tmp, cacheFile());
  } catch { /* cache is an optimisation; never fatal */ }
}

export function clearCache() {
  try { fs.unlinkSync(cacheFile()); return true; } catch { return false; }
}

/**
 * Collect sessions from `agents`. Returns { sessions, warnings, stats }.
 * Each session: { agent, id, title, cwd, startedAt, updatedAt, messages, firstPrompt, lastPrompt, text, file? }
 */
export function collect(agents, { all = false, noCache = false, onProgress, config = {} } = {}) {
  const cache = noCache ? { version: CACHE_VERSION, files: {} } : readCache();
  const nextFiles = {};
  const sessions = [];
  const warnings = [];
  const stats = {};
  let dirty = noCache;

  for (const agent of agents) {
    const st = (stats[agent.name] = { found: false, sessions: 0, parsed: 0, cached: 0, location: safe(() => agent.location()) });
    try {
      if (!agent.detect()) continue;
      st.found = true;
      if (agent.load) {
        for (const s of agent.load({ all })) { sessions.push({ ...s, agent: agent.name }); st.sessions++; }
        continue;
      }
      // Folder-scoped agents (aider) look in every folder any agent has used, including ones
      // only known from the cache when this run is filtered with --agent.
      const cwds = new Set(sessions.map((x) => x.cwd));
      for (const v of Object.values(cache.files)) if (v.s?.cwd) cwds.add(v.s.cwd);
      for (const d of cache.dirs || []) cwds.add(d);
      cwds.delete('');
      const files = agent.files({ cwds: [...cwds], config });
      let announced = false;
      for (const [i, file] of files.entries()) {
        let stat;
        try { stat = agent.stamp ? agent.stamp(file) : (({ mtimeMs, size }) => ({ m: mtimeMs, z: size }))(fs.statSync(file)); } catch { continue; }
        const key = `${agent.name}\u0000${file}`;
        const hit = cache.files[key];
        let s;
        if (hit && hit.m === stat.m && hit.z === stat.z) { s = hit.s; st.cached++; }
        else {
          if (onProgress && !announced && !hit && files.length - i > 20) { announced = true; onProgress(agent, files.length - i); }
          try { s = agent.parse(file); } catch (e) { warnings.push(`${agent.name}: ${path.basename(file)}: ${e.message}`); s = null; }
          st.parsed++;
          dirty = true;
        }
        nextFiles[key] = { m: stat.m, z: stat.z, s };
        if (s && (all || !s.headless)) { sessions.push({ ...s, agent: agent.name, file }); st.sessions++; }
      }
    } catch (e) {
      warnings.push(`${agent.name}: ${e.message}`);
    }
  }
  // Keep cache entries for agents that weren't scanned this run (e.g. --agent filter).
  const scanned = new Set(agents.map((a) => a.name));
  for (const [k, v] of Object.entries(cache.files)) if (!scanned.has(k.split('\u0000')[0])) nextFiles[k] = v;
  const dirs = new Set([...(cache.dirs || []), ...sessions.map((x) => x.cwd).filter(Boolean)]);
  if (dirs.size !== (cache.dirs || []).length) dirty = true;
  if (dirty || Object.keys(nextFiles).length !== Object.keys(cache.files).length) writeCache({ version: CACHE_VERSION, files: nextFiles, dirs: [...dirs] });

  const out = dedupe(sessions).sort((a, b) => b.updatedAt - a.updatedAt);
  return { sessions: out, warnings, stats };
}

/** The same session id can appear in several files (forks/copies); keep the freshest. */
function dedupe(list) {
  const best = new Map();
  for (const s of list) {
    const k = s.agent + ':' + s.id;
    const cur = best.get(k);
    if (!cur || s.updatedAt > cur.updatedAt) best.set(k, s);
  }
  return [...best.values()];
}

function safe(fn) { try { return fn(); } catch { return ''; } }
