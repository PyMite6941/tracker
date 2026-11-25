// Shared helpers: paths, terminal width, colours, time, tiny glob, sqlite loader.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

export const HOME = os.homedir();
export const IS_WIN = process.platform === 'win32';

export function expandHome(p) {
  if (!p) return p;
  let out = p.replace(/^~(?=$|[\\/])/, HOME);
  // ${VAR} and %VAR% expansion so config paths work on every OS.
  out = out.replace(/\$\{(\w+)\}/g, (_, v) => process.env[v] ?? '');
  out = out.replace(/%(\w+)%/g, (m, v) => process.env[v] ?? m);
  return path.normalize(out);
}

export function tildify(p) {
  if (!p) return '';
  if (p.toLowerCase().startsWith(HOME.toLowerCase())) return '~' + p.slice(HOME.length);
  return p;
}

/** Last `n` path segments, for compact display. */
export function shortPath(p, n = 2) {
  if (!p) return '';
  const parts = tildify(p).split(/[\\/]+/).filter(Boolean);
  if (parts.length <= n) return tildify(p);
  return '…/' + parts.slice(-n).join('/');
}

/** True when `child` is `parent` or inside it (case-insensitive on Windows/macOS). */
export function isUnder(child, parent) {
  if (!child || !parent) return false;
  const norm = (p) => { const r = path.resolve(p).replace(/[\/]+$/, ''); return IS_WIN || process.platform === 'darwin' ? r.toLowerCase() : r; };
  const c = norm(child), pa = norm(parent);
  return c === pa || c.startsWith(pa + path.sep);
}

/**
 * The path with its letter casing as spelled on disk (some stores lowercase it). Only casing is
 * changed: if resolving would also follow a symlink or expand a short name, the input is kept.
 */
export function truePath(p) {
  if (!p) return p;
  try {
    const real = fs.realpathSync.native(p);
    return real.toLowerCase() === p.toLowerCase() ? real : p;
  } catch { return p; }
}

export function exists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

export function isDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

export function cacheDir() {
  if (process.env.TRACKER_CACHE_DIR) return expandHome(process.env.TRACKER_CACHE_DIR);
  if (IS_WIN) return path.join(process.env.LOCALAPPDATA || path.join(HOME, 'AppData', 'Local'), 'tracker');
  if (process.platform === 'darwin') return path.join(HOME, 'Library', 'Caches', 'tracker');
  return path.join(process.env.XDG_CACHE_HOME || path.join(HOME, '.cache'), 'tracker');
}

export function configPath() {
  if (process.env.TRACKER_CONFIG) return expandHome(process.env.TRACKER_CONFIG);
  const base = IS_WIN
    ? (process.env.APPDATA || path.join(HOME, 'AppData', 'Roaming'))
    : (process.env.XDG_CONFIG_HOME || path.join(HOME, '.config'));
  return path.join(base, 'tracker', 'config.json');
}

// ---------- time ----------

export function toMs(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v < 1e12 ? Math.round(v * 1000) : Math.round(v); // seconds vs ms
  if (/^\d+(\.\d+)?$/.test(String(v))) return toMs(Number(v));
  const t = Date.parse(v);
  return Number.isNaN(t) ? 0 : t;
}

export function timeAgo(ms, now = Date.now()) {
  if (!ms) return '?';
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 60) return `${d}d ago`;
  // Older: "Sep 5" this year, "Sep 2025" before that (fits the 8-column age field).
  const dt = new Date(ms);
  const mon = dt.toLocaleString('en-US', { month: 'short' });
  return dt.getFullYear() === new Date(now).getFullYear() ? `${mon} ${dt.getDate()}` : `${mon} ${dt.getFullYear()}`;
}

// ---------- text ----------

/** Collapse whitespace/control chars so a value renders on one line. */
export function oneLine(s) {
  return String(s ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Terminal cell width of one code point (East Asian wide = 2, combining = 0). */
export function charWidth(cp) {
  if (cp === 0) return 0;
  if (cp < 32 || (cp >= 0x7f && cp < 0xa0)) return 0;
  if ((cp >= 0x300 && cp <= 0x36f) || (cp >= 0x200b && cp <= 0x200f) || (cp >= 0xfe00 && cp <= 0xfe0f)) return 0;
  if (
    (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) ||
    (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) || (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) || (cp >= 0x1f300 && cp <= 0x1faff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  ) return 2;
  return 1;
}

export function strWidth(s) {
  let w = 0;
  for (const ch of stripAnsi(s)) w += charWidth(ch.codePointAt(0));
  return w;
}

/** Truncate plain text to `width` cells, adding an ellipsis, then pad to exactly `width`. */
export function fit(s, width, { pad = true } = {}) {
  s = oneLine(s);
  if (width <= 0) return '';
  let out = '';
  let w = 0;
  const total = strWidth(s);
  const limit = total > width ? width - 1 : width;
  for (const ch of s) {
    const cw = charWidth(ch.codePointAt(0));
    if (w + cw > limit) break;
    out += ch;
    w += cw;
  }
  if (total > width) { out += '…'; w += 1; }
  return pad ? out + ' '.repeat(Math.max(0, width - w)) : out;
}

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;?]*[A-Za-z]/g;
export function stripAnsi(s) { return String(s).replace(ANSI_RE, ''); }

// ---------- colour ----------

let colorOn = !process.env.NO_COLOR && process.stdout.isTTY;
export function setColor(on) { colorOn = on; }
const wrap = (open, close) => (s) => (colorOn ? `\x1b[${open}m${s}\x1b[${close}m` : String(s));
export const c = {
  bold: wrap(1, 22), dim: wrap(2, 22), italic: wrap(3, 23), underline: wrap(4, 24), inverse: wrap(7, 27),
  red: wrap(31, 39), green: wrap(32, 39), yellow: wrap(33, 39), blue: wrap(34, 39),
  magenta: wrap(35, 39), cyan: wrap(36, 39), gray: wrap(90, 39),
};
/** 256-colour foreground / background (closes only that attribute, so they nest). */
export const fg = (n) => wrap(`38;5;${n}`, 39);
export const bg = (n) => wrap(`48;5;${n}`, 49);
export const isColor = () => colorOn;

/** Theme, taken from the logo: sky + teal on slate. */
export const T = {
  accent: fg(81), teal: fg(80), muted: fg(244), faint: fg(240), text: fg(253), warn: fg(221), ok: fg(114),
  hit: (s) => (colorOn ? `\x1b[1;4;38;5;222m${s}\x1b[22;24;39m` : s), // search-term highlight
  selBg: 236, chipBg: 237, keyBg: 238,
};

const HUES = { claude: 209, codex: 114, gemini: 75, qwen: 141, opencode: 221, cursor: 252, copilot: 177, hermes: 80, aider: 150 };
const EXTRA_HUES = [168, 116, 186, 147, 210, 79, 183, 109];
export function agentHue(name = '') {
  if (HUES[name]) return HUES[name];
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return EXTRA_HUES[h % EXTRA_HUES.length];
}
export function agentColor(name) { return fg(agentHue(name)); }

/** Wrap every case-insensitive occurrence of `terms` in an already width-fitted plain string. */
export function highlight(s, terms) {
  if (!colorOn || !terms?.length) return s;
  const re = new RegExp(terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi');
  return s.replace(re, (m) => T.hit(m));
}

// ---------- tiny glob ----------

/**
 * Expand a glob supporting `*`, `?` and `**` path segments. Returns absolute file paths.
 * Good enough for agent session layouts; no brace expansion.
 */
export function glob(pattern, { maxDepth = 12 } = {}) {
  const abs = expandHome(pattern).replace(/\\/g, '/');
  const segs = abs.split('/');
  // Find the static prefix.
  let i = 0;
  while (i < segs.length && !/[*?]/.test(segs[i])) i++;
  let root = segs.slice(0, i).join('/') || '/';
  if (/^[A-Za-z]:$/.test(root)) root += '/';
  const rest = segs.slice(i);
  if (!rest.length) return exists(root) ? [path.normalize(root)] : [];
  const out = [];
  const toRe = (seg) => new RegExp('^' + seg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', IS_WIN ? 'i' : '');
  const res = rest.map((s) => (s === '**' ? '**' : toRe(s)));

  const walk = (dir, idx, depth) => {
    if (depth > maxDepth) return;
    if (idx === res.length) return;
    const pat = res[idx];
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    if (pat === '**') {
      walk(dir, idx + 1, depth); // zero dirs
      for (const e of entries) if (e.isDirectory()) walk(path.join(dir, e.name), idx, depth + 1);
      return;
    }
    const last = idx === res.length - 1;
    for (const e of entries) {
      if (!pat.test(e.name)) continue;
      const full = path.join(dir, e.name);
      if (last) { if (e.isFile()) out.push(full); }
      else if (e.isDirectory()) walk(full, idx + 1, depth + 1);
    }
  };
  walk(root, 0, 0);
  return [...new Set(out)];
}

// ---------- json path ----------

/** Read `a.b.0.c` from an object. `$filename` / `$dirname` are resolved by callers. */
export function getPath(obj, p) {
  if (!p || obj == null) return undefined;
  let cur = obj;
  for (const k of String(p).split('.')) {
    if (cur == null) return undefined;
    cur = cur[k];
  }
  return cur;
}

/** Flatten message content (string | [{type:'text', text}] | {text}) into plain text. */
export function contentText(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) {
    return v.map((p) => (typeof p === 'string' ? p : (p && typeof p.text === 'string' ? p.text : ''))).filter(Boolean).join('\n');
  }
  if (typeof v === 'object') return typeof v.text === 'string' ? v.text : contentText(v.content ?? v.parts);
  return String(v);
}

// ---------- sqlite ----------

let sqliteMod;
/** Load node:sqlite without its ExperimentalWarning leaking onto the user's terminal. */
export function loadSqlite() {
  if (sqliteMod !== undefined) return sqliteMod;
  const orig = process.emitWarning;
  process.emitWarning = function (w, ...rest) {
    const msg = typeof w === 'string' ? w : w?.message;
    if (msg && msg.includes('SQLite')) return;
    return orig.call(process, w, ...rest);
  };
  try {
    sqliteMod = createRequire(import.meta.url)('node:sqlite');
  } catch {
    sqliteMod = null;
  } finally {
    process.emitWarning = orig;
  }
  return sqliteMod;
}

export function openSqlite(file) {
  const mod = loadSqlite();
  if (!mod) throw new Error('node:sqlite unavailable — tracker needs Node >= 22.13 for SQLite-backed agents');
  return new mod.DatabaseSync(file, { readOnly: true });
}
