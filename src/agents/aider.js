// Aider writes .aider.chat.history.md into whichever folder you ran it from (usually the git root).
// There is no central store, so we look in: $HOME, every folder another agent has a session in,
// and any extra roots listed in config ("aider": { "roots": [...] }).
import fs from 'node:fs';
import path from 'node:path';
import { HOME, expandHome, toMs, truePath } from '../util.js';
import { PromptBag, titleFrom } from './common.js';

const FILE = '.aider.chat.history.md';
const START_RE = /^# aider chat started at (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/;

export function parseAider(file, raw = fs.readFileSync(file, 'utf8')) {
  const bag = new PromptBag();
  let startedAt = 0, lastStart = 0, replies = 0, model = '';
  let inAssistant = false;
  for (const line of raw.split(/\r?\n/)) {
    const st = START_RE.exec(line);
    if (st) { const t = toMs(st[1].replace(' ', 'T')); if (!startedAt) startedAt = t; lastStart = t; inAssistant = false; continue; }
    if (line.startsWith('#### ')) { bag.add(line.slice(5)); inAssistant = true; replies++; continue; }
    if (!model) { const m = /^> (?:Main )?[Mm]odel: (\S+)/.exec(line) || /--model (\S+)/.exec(line); if (m) model = m[1]; }
  }
  if (!bag.count) return null;
  let updatedAt = lastStart;
  try { updatedAt = Math.max(updatedAt, fs.statSync(file).mtimeMs); } catch { /* ignore */ }
  const cwd = path.dirname(file);
  return {
    id: cwd, // aider resumes per folder, not per id
    cwd, model,
    title: titleFrom(bag.first),
    startedAt: startedAt || updatedAt, updatedAt,
    messages: replies * 2,
    firstPrompt: bag.first, lastPrompt: bag.last, text: bag.text,
  };
}

export default {
  name: 'aider',
  label: 'Aider',
  command: 'aider',
  location: () => path.join(HOME, FILE),
  detect: () => true, // can't know without looking in project folders
  files(ctx = {}) {
    const dirs = new Set([HOME, ...(ctx.cwds || []), ...((ctx.config?.aider?.roots) || []).map(expandHome)]);
    const out = new Set(); // canonical paths, so C:\x and c:\x don't yield the same history twice
    for (const d of dirs) {
      if (!d) continue;
      const f = path.join(d, FILE);
      if (fs.existsSync(f)) out.add(truePath(f));
    }
    return [...out];
  },
  parse: (file) => parseAider(file),
  resume: (s) => ({ command: 'aider', args: ['--restore-chat-history'], cwd: s.cwd }),
};
