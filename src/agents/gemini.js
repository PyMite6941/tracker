// Gemini CLI (and its forks, e.g. Qwen Code): <home>/tmp/<project>/chats/session-*.json
// <project> is either a short name mapped in projects.json or sha256(cwd).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { HOME, expandHome, toMs, contentText, isDir, truePath } from '../util.js';
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
    cwd: truePath(cwdLookup.get(projectDir) || cwdLookup.get(d.projectHash) || ''), // projects.json keys are lowercased
    model,
    title: titleFrom(d.title, d.summary, bag.first),
    startedAt: toMs(d.startTime), updatedAt: toMs(d.lastUpdated) || toMs(d.startTime),
    messages: bag.count + other,
    firstPrompt: bag.first, lastPrompt: bag.last, text: bag.text,
  };
}

/**
 * Newer Qwen Code (>= 0.2x) layout: <home>/projects/<sanitised-cwd>/chats/<session-id>.jsonl, one record
 * per line ({type:'user', message:{role, parts:[{text}]}, cwd, sessionId, timestamp}), with a sibling
 * <session-id>.runtime.json holding work_dir.
 */
export function parseChatJsonl(file, raw = fs.readFileSync(file, 'utf8')) {
  const bag = new PromptBag();
  let id = path.basename(file, '.jsonl'), cwd = '', model = '', startedAt = 0, updatedAt = 0, other = 0;
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let d;
    try { d = JSON.parse(line); } catch { continue; }
    const ts = toMs(d.timestamp);
    if (ts) { if (!startedAt) startedAt = ts; updatedAt = ts; }
    if (d.sessionId) id = d.sessionId;
    if (!cwd && d.cwd) cwd = d.cwd;
    if (!model && d.model) model = d.model;
    if (d.type === 'user' && (d.message?.role ?? 'user') === 'user') bag.add(contentText(d.message?.parts ?? d.message?.content));
    else if (d.type === 'assistant' || d.message?.role === 'model') other++;
  }
  if (!cwd) {
    try { cwd = JSON.parse(fs.readFileSync(file.replace(/\.jsonl$/, '.runtime.json'), 'utf8')).work_dir || ''; } catch { /* none */ }
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

function listChats(base, ext) {
  const out = [];
  let projects = [];
  try { projects = fs.readdirSync(base, { withFileTypes: true }); } catch { return out; }
  for (const p of projects) {
    if (!p.isDirectory()) continue;
    const chats = path.join(base, p.name, 'chats');
    let files = [];
    try { files = fs.readdirSync(chats); } catch { continue; }
    for (const f of files) if (f.endsWith(ext) && !f.endsWith('.runtime.json')) out.push(path.join(chats, f));
  }
  return out;
}

export function geminiFamily({ name, label, command, homeEnv, dir }) {
  const home = () => (process.env[homeEnv] ? expandHome(process.env[homeEnv]) : path.join(HOME, dir));
  let lookup = null;
  return {
    name, label, command,
    location: () => home(),
    detect() { return isDir(path.join(home(), 'tmp')) || isDir(path.join(home(), 'projects')); },
    files() {
      lookup = projectMap(home());
      return [...listChats(path.join(home(), 'tmp'), '.json'), ...listChats(path.join(home(), 'projects'), '.jsonl')];
    },
    parse: (file) => (file.endsWith('.jsonl') ? parseChatJsonl(file) : parseGemini(file, undefined, lookup || projectMap(home()))),
    resume: (s) => ({ command, args: ['--resume', s.id], cwd: s.cwd }),
  };
}

export default geminiFamily({ name: 'gemini', label: 'Gemini CLI', command: 'gemini', homeEnv: 'GEMINI_DIR', dir: '.gemini' });
export const qwen = geminiFamily({ name: 'qwen', label: 'Qwen Code', command: 'qwen', homeEnv: 'QWEN_DIR', dir: '.qwen' });
