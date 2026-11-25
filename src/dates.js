// Date filters: "--since 7d", "--since today", "--since 2026-11-01", and the TUI's ^T cycle.

const DAY = 86400000;

/** Ranges the TUI cycles through with ^T, in order. */
export const DATE_RANGES = ['any', 'today', '24h', '7d', '30d', '90d'];

function startOfDay(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Parse a "since" spec into an epoch-ms lower bound (0 = no bound).
 * Accepts: any | today | yesterday | <n>h | <n>d | <n>w | <n>m (months) | YYYY-MM-DD.
 */
export function sinceMs(spec, now = Date.now()) {
  const s = String(spec ?? '').trim().toLowerCase();
  if (!s || s === 'any' || s === 'all') return 0;
  if (s === 'today') return startOfDay(now);
  if (s === 'yesterday') return startOfDay(now) - DAY;
  const rel = /^(\d+)\s*(h|d|w|m)$/.exec(s);
  if (rel) {
    const n = Number(rel[1]);
    if (rel[2] === 'h') return now - n * 3600000;
    if (rel[2] === 'd') return now - n * DAY;
    if (rel[2] === 'w') return now - n * 7 * DAY;
    const d = new Date(now);
    d.setMonth(d.getMonth() - n);
    return d.getTime();
  }
  const abs = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (abs) return new Date(Number(abs[1]), Number(abs[2]) - 1, Number(abs[3])).getTime();
  throw new Error(`can't read date "${spec}" — use today, yesterday, 24h, 7d, 2w, 3m or YYYY-MM-DD`);
}

/** Human label for a range, used in the TUI chip. */
export function rangeLabel(spec) {
  const s = String(spec || 'any').toLowerCase();
  const m = /^(\d+)(h|d|w|m)$/.exec(s);
  if (!m) return s;
  return `last ${m[1]}${m[2]}`;
}

/** Keep sessions updated at or after `spec`. */
export function filterSince(sessions, spec, now = Date.now()) {
  const from = sinceMs(spec, now);
  return from ? sessions.filter((s) => (s.updatedAt || 0) >= from) : sessions;
}
