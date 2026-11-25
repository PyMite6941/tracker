// Gemini CLI (and its forks, e.g. Qwen Code): <home>/tmp/<project>/chats/session-*.json
// <project> is either a short name mapped in projects.json or sha256(cwd).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { HOME, expandHome, toMs, contentText, isDir } from '../util.js';
import { PromptBag, titleFrom } from './common.js';

/** Map project dir name -> cwd using projects.json (name and sha256 keys both resolve). */
export function projectMap(home) {
  const map = new Map();
  let projects = {};
  try { projects = JSON.parse(fs.readFileSync(path.join(home, 'projects.json'), 'utf8')).projects || {}; } catch { /* none */ }
  for (const [cwd, name] of Object.entries(projects)) {
    map.set(String(name), cwd);
    for (const v of new Set([cwd, cwd.replace(/^([a-z]):/, (_, d) => d.toUpperCase() + ':')])) {
      map.set(crypto.createHash('sha256').update(v).digest('hex'), cwd);
    }
  }
  return map;
}

export function parseGemini(file, raw, cwdLookup = new Map()) {
  raw ??= fs.readFileSync(file, 'utf8');
  let d;
  try { d = JSON.parse(raw); } catch { return null; }
  const msgs = Array.isArray(d.messages) ? d.messages : Array.isArray(d) ? d : [];
  const bag = new PromptBag();
  let other = 0, model = '';
  for (const m of msgs) {
    const role = m.type ?? m.role;
    if (role === 'user') bag.add(contentText(m.content ?? m.parts));
    else if (role === 'gemini' || role === 'model' || role === 'assistant') { other++; model ||= m.model || ''; }
  }
  if (!bag.count) return null;
  const projectDir = path.basename(path.dirname(path.dirname(file)));
  return {
    id: d.sessionId || path.basename(file, '.json'),
    cwd: cwdLookup.get(projectDir) || cwdLookup.get(d.projectHash) || '',
    model,
    title: titleFrom(d.title, d.summary, bag.first),
    startedAt: toMs(d.startTime), updatedAt: toMs(d.lastUpdated) || toMs(d.startTime),
    messages: bag.count + other,
    firstPrompt: bag.first, lastPrompt: bag.last, text: bag.text,
  };
}

export function geminiFamily({ name, label, command, homeEnv, dir }) {
  const home = () => (process.env[homeEnv] ? expandHome(process.env[homeEnv]) : path.join(HOME, dir));
  let lookup = null;
  return {
    name, label, command,
    location: () => path.join(home(), 'tmp'),
    detect() { return isDir(this.location()); },
    files() {
      lookup = projectMap(home());
      const out = [];
      let projects = [];
      try { projects = fs.readdirSync(this.location(), { withFileTypes: true }); } catch { return out; }
      for (const p of projects) {
        if (!p.isDirectory()) continue;
        const chats = path.join(this.location(), p.name, 'chats');
        let files = [];
        try { files = fs.readdirSync(chats); } catch { continue; }
        for (const f of files) if (f.endsWith('.json')) out.push(path.join(chats, f));
      }
      return out;
    },
    parse: (file) => parseGemini(file, undefined, lookup || projectMap(home())),
    resume: (s) => ({ command, args: ['--resume', s.id], cwd: s.cwd }),
  };
}

export default geminiFamily({ name: 'gemini', label: 'Gemini CLI', command: 'gemini', homeEnv: 'GEMINI_DIR', dir: '.gemini' });
export const qwen = geminiFamily({ name: 'qwen', label: 'Qwen Code', command: 'qwen', homeEnv: 'QWEN_DIR', dir: '.qwen' });
