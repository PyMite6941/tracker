// OpenAI Codex CLI: $CODEX_HOME/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl
import fs from 'node:fs';
import path from 'node:path';
import { HOME, expandHome, toMs, contentText, glob, isDir } from '../util.js';
import { PromptBag, titleFrom } from './common.js';

const root = () => (process.env.CODEX_HOME ? expandHome(process.env.CODEX_HOME) : path.join(HOME, '.codex'));
const UUID_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i;

export function parseCodex(file, raw = fs.readFileSync(file, 'utf8')) {
  const fromEvents = new PromptBag();
  const fromItems = new PromptBag();
  let id = (file.match(UUID_RE) || [])[1] || path.basename(file, '.jsonl');
  let cwd = '', model = '', startedAt = 0, updatedAt = 0, assistant = 0;

  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let d;
    try { d = JSON.parse(line); } catch { continue; }
    const ts = toMs(d.timestamp);
    if (ts) { if (!startedAt) startedAt = ts; updatedAt = ts; }
    const p = d.payload ?? d; // newer files wrap items in {type, payload}; older ones don't
    if (d.type === 'session_meta' || (!d.type && d.id && d.timestamp)) {
      if (p.id) id = p.id;
      if (p.cwd) cwd = p.cwd;
      if (p.timestamp && !startedAt) startedAt = toMs(p.timestamp);
      continue;
    }
    if (d.type === 'turn_context' && p.model) { model ||= p.model; if (!cwd && p.cwd) cwd = p.cwd; continue; }
    if (p.type === 'user_message' && typeof p.message === 'string') { fromEvents.add(p.message); continue; }
    if (p.type === 'message') {
      if (p.role === 'user') fromItems.add(contentText(p.content));
      else if (p.role === 'assistant') assistant++;
    }
  }
  // event_msg/user_message is the clean, user-typed text; fall back to raw items on older files.
  const bag = fromEvents.count ? fromEvents : fromItems;
  if (!bag.count) return null;
  return {
    id, cwd, model,
    title: titleFrom(bag.first),
    startedAt, updatedAt: updatedAt || startedAt,
    messages: bag.count + assistant,
    firstPrompt: bag.first, lastPrompt: bag.last, text: bag.text,
  };
}

export default {
  name: 'codex',
  label: 'OpenAI Codex CLI',
  command: 'codex',
  location: () => path.join(root(), 'sessions'),
  detect() { return isDir(this.location()); },
  files() { return glob(path.join(this.location(), '**', 'rollout-*.jsonl')); },
  parse: (file) => parseCodex(file),
  resume: (s) => ({ command: 'codex', args: ['resume', s.id], cwd: s.cwd }),
};
