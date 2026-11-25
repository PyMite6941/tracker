// Cursor Agent CLI (cursor-agent): ~/.cursor/chats/<hash>/<chat-id>/{meta.json, prompt_history.json, store.db}
import fs from 'node:fs';
import path from 'node:path';
import { HOME, expandHome, toMs, isDir } from '../util.js';
import { PromptBag, titleFrom } from './common.js';

const root = () => (process.env.CURSOR_DIR ? expandHome(process.env.CURSOR_DIR) : path.join(HOME, '.cursor'));

export function parseCursor(metaFile) {
  let meta;
  try { meta = JSON.parse(fs.readFileSync(metaFile, 'utf8')); } catch { return null; }
  if (meta.hasConversation === false) return null;
  const dir = path.dirname(metaFile);
  const bag = new PromptBag();
  try {
    const hist = JSON.parse(fs.readFileSync(path.join(dir, 'prompt_history.json'), 'utf8'));
    if (Array.isArray(hist)) for (const p of hist) bag.add(typeof p === 'string' ? p : p?.text ?? p?.prompt);
  } catch { /* chat without typed prompts */ }
  if (!bag.count && !meta.title) return null;
  return {
    id: path.basename(dir), cwd: meta.cwd || '', model: meta.model || '',
    title: titleFrom(meta.title, bag.first),
    startedAt: toMs(meta.createdAtMs), updatedAt: toMs(meta.updatedAtMs) || toMs(meta.createdAtMs),
    messages: bag.count,
    firstPrompt: bag.first, lastPrompt: bag.last, text: bag.text,
  };
}

export default {
  name: 'cursor',
  label: 'Cursor Agent CLI',
  command: 'cursor-agent',
  location: () => path.join(root(), 'chats'),
  detect() { return isDir(this.location()); },
  files() {
    const out = [];
    let hashes = [];
    try { hashes = fs.readdirSync(this.location(), { withFileTypes: true }); } catch { return out; }
    for (const h of hashes) {
      if (!h.isDirectory()) continue;
      let chats = [];
      try { chats = fs.readdirSync(path.join(this.location(), h.name), { withFileTypes: true }); } catch { continue; }
      for (const ch of chats) {
        const meta = path.join(this.location(), h.name, ch.name, 'meta.json');
        if (ch.isDirectory() && fs.existsSync(meta)) out.push(meta);
      }
    }
    return out;
  },
  // prompt_history.json can change without meta.json changing; fold both into the cache key.
  stamp(metaFile) {
    let m = 0, z = 0;
    for (const f of [metaFile, path.join(path.dirname(metaFile), 'prompt_history.json')]) {
      try { const st = fs.statSync(f); m = Math.max(m, st.mtimeMs); z += st.size; } catch { /* missing */ }
    }
    return { m, z };
  },
  parse: (file) => parseCursor(file),
  resume: (s) => ({ command: 'cursor-agent', args: ['--resume', s.id], cwd: s.cwd }),
};
