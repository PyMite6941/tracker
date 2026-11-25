// Claude Code: one JSONL transcript per session at <config>/projects/<encoded-cwd>/<session-id>.jsonl
import fs from 'node:fs';
import path from 'node:path';
import { HOME, expandHome, toMs, contentText, isDir } from '../util.js';
import { PromptBag, titleFrom } from './common.js';

function root() {
  return process.env.CLAUDE_CONFIG_DIR ? expandHome(process.env.CLAUDE_CONFIG_DIR) : path.join(HOME, '.claude');
}

const TS_RE = /"timestamp":"([^"]+)"/;

export function parseClaude(file, raw = fs.readFileSync(file, 'utf8')) {
  const bag = new PromptBag();
  let id = path.basename(file, '.jsonl');
  let cwd = '', model = '', gitBranch = '', entrypoint = '';
  let customTitle = '', aiTitle = '', summary = '';
  let startedAt = 0, updatedAt = 0, assistant = 0;

  for (const line of raw.split('\n')) {
    if (!line) continue;
    // Cheap pre-filters: only JSON.parse the lines we actually need.
    if (!startedAt) { const m = TS_RE.exec(line); if (m) startedAt = toMs(m[1]); }
    // Tool results are role=user too and make up ~90% of user lines (often huge): skip them unparsed.
    const isUser = line.includes('"type":"user"') && !line.includes('"type":"tool_result"');
    const isTitle = line.includes('"type":"ai-title"') || line.includes('"type":"custom-title"') || line.includes('"type":"summary"');
    const isAsst = line.includes('"type":"assistant"');
    if (isAsst) assistant++;
    if (!isUser && !isTitle && !(isAsst && !model) && cwd) continue;
    let d;
    try { d = JSON.parse(line); } catch { continue; }
    if (d.sessionId && !id) id = d.sessionId;
    if (!cwd && d.cwd) cwd = d.cwd;
    if (!gitBranch && d.gitBranch) gitBranch = d.gitBranch;
    if (!entrypoint && d.entrypoint) entrypoint = d.entrypoint;
    switch (d.type) {
      case 'custom-title': customTitle = d.customTitle || customTitle; break;
      case 'ai-title': aiTitle = d.aiTitle || aiTitle; break;
      case 'summary': summary = d.summary || summary; break;
      case 'assistant': if (!model && d.message?.model && d.message.model !== '<synthetic>') model = d.message.model; break;
      case 'user': {
        if (d.isMeta || d.isSidechain || d.message?.role !== 'user') break;
        const content = d.message.content;
        // Tool results also arrive as role=user; only keep real text turns.
        if (Array.isArray(content) && content.every((p) => p?.type === 'tool_result')) break;
        bag.add(contentText(content));
        break;
      }
    }
  }
  // Last activity: the final timestamp in the file (scan backwards, no full parse).
  const tail = raw.slice(-20000).split('\n');
  for (let i = tail.length - 1; i >= 0 && !updatedAt; i--) { const m = TS_RE.exec(tail[i]); if (m) updatedAt = toMs(m[1]); }
  if (!bag.count) return null; // metadata-only stubs aren't resumable conversations

  return {
    id, cwd, model, gitBranch,
    title: titleFrom(customTitle, aiTitle, summary, bag.first),
    startedAt, updatedAt: updatedAt || startedAt,
    messages: bag.count + assistant,
    firstPrompt: bag.first, lastPrompt: bag.last, text: bag.text,
    // `claude -p` / Agent SDK runs (hooks, scripts) — hidden unless --all.
    headless: entrypoint === 'sdk-cli' || entrypoint === 'sdk-ts' || entrypoint === 'sdk-py',
  };
}

export default {
  name: 'claude',
  label: 'Claude Code',
  command: 'claude',
  location: () => path.join(root(), 'projects'),
  detect() { return isDir(this.location()); },
  files() {
    const dir = this.location();
    const out = [];
    let projects = [];
    try { projects = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
    for (const p of projects) {
      if (!p.isDirectory()) continue;
      const pdir = path.join(dir, p.name);
      let entries = [];
      try { entries = fs.readdirSync(pdir, { withFileTypes: true }); } catch { continue; }
      // Top level only: subagent transcripts live deeper and can't be resumed directly.
      for (const e of entries) if (e.isFile() && e.name.endsWith('.jsonl')) out.push(path.join(pdir, e.name));
    }
    return out;
  },
  parse: (file) => parseClaude(file),
  resume: (s) => ({ command: 'claude', args: ['--resume', s.id], cwd: s.cwd }),
};
