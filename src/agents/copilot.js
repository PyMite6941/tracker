// GitHub Copilot CLI: ~/.copilot/session-state/<session-id>.jsonl (event stream).
// Built from the documented event shapes; fixture-tested (no local data was available).
import fs from 'node:fs';
import path from 'node:path';
import { HOME, expandHome, toMs, contentText, isDir } from '../util.js';
import { PromptBag, titleFrom } from './common.js';

const root = () => (process.env.COPILOT_HOME ? expandHome(process.env.COPILOT_HOME) : path.join(HOME, '.copilot'));

export function parseCopilot(file, raw = fs.readFileSync(file, 'utf8')) {
  const bag = new PromptBag();
  let id = path.basename(file, '.jsonl'), cwd = '', model = '', startedAt = 0, updatedAt = 0, other = 0;
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let d;
    try { d = JSON.parse(line); } catch { continue; }
    const data = d.data ?? d;
    const ts = toMs(d.timestamp ?? data.timestamp);
    if (ts) { if (!startedAt) startedAt = ts; updatedAt = ts; }
    switch (d.type) {
      case 'session.start':
        id = data.sessionId || id;
        cwd = data.context?.cwd || data.cwd || cwd;
        model = data.selectedModel || data.model || model;
        break;
      case 'session.model_change': model = data.newModel || model; break;
      case 'user.message': bag.add(contentText(data.content ?? data.text)); break;
      case 'assistant.message': other++; break;
      default:
        if (d.role === 'user' || data.role === 'user') bag.add(contentText(data.content));
    }
  }
  if (!bag.count) return null;
  return {
    id, cwd, model,
    title: titleFrom(bag.first),
    startedAt, updatedAt: updatedAt || startedAt,
    messages: bag.count + other,
    firstPrompt: bag.first, lastPrompt: bag.last, text: bag.text,
  };
}

export default {
  name: 'copilot',
  label: 'GitHub Copilot CLI',
  command: 'copilot',
  location: () => path.join(root(), 'session-state'),
  detect() { return isDir(this.location()); },
  files() {
    try { return fs.readdirSync(this.location()).filter((f) => f.endsWith('.jsonl')).map((f) => path.join(this.location(), f)); } catch { return []; }
  },
  parse: (file) => parseCopilot(file),
  resume: (s) => ({ command: 'copilot', args: ['--resume', s.id], cwd: s.cwd }),
};
