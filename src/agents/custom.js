// Config-defined agents: point tracker at any tool that writes sessions as JSONL, JSON or SQLite.
import fs from 'node:fs';
import path from 'node:path';
import { glob, getPath, toMs, contentText, expandHome, exists } from '../util.js';
import { PromptBag, titleFrom, SAFE_ID } from './common.js';
import { sqliteAgent } from './sqlite.js';

const DEFAULT_FIELDS = {
  id: 'sessionId', cwd: 'cwd', title: 'title', timestamp: 'timestamp', model: 'model',
  role: 'role', text: 'content', userRole: 'user', messages: 'messages',
  startedAt: 'startedAt', updatedAt: 'updatedAt',
};

/** Resolve `$filename`, `$dirname`, `$parent` pseudo-fields, else a dotted path into the record. */
function field(obj, spec, file) {
  if (!spec) return undefined;
  if (spec === '$filename') return path.basename(file).replace(/\.(jsonl?|json)$/i, '');
  if (spec === '$dirname') return path.basename(path.dirname(file));
  if (spec === '$parent') return path.dirname(file);
  return getPath(obj, spec);
}

function fromMessages(file, f, records, top = {}) {
  const bag = new PromptBag();
  let id = field(top, f.id, file), cwd = field(top, f.cwd, file), title = field(top, f.title, file), model = field(top, f.model, file);
  let startedAt = toMs(field(top, f.startedAt, file)), updatedAt = toMs(field(top, f.updatedAt, file));
  let other = 0;
  for (const r of records) {
    if (!r || typeof r !== 'object') continue;
    id ??= field(r, f.id, file);
    cwd ||= field(r, f.cwd, file);
    title ||= field(r, f.title, file);
    model ||= field(r, f.model, file);
    const ts = toMs(field(r, f.timestamp, file));
    if (ts) { if (!startedAt) startedAt = ts; if (ts > updatedAt) updatedAt = ts; }
    const role = field(r, f.role, file);
    const users = Array.isArray(f.userRole) ? f.userRole : [f.userRole];
    if (role != null && users.includes(role)) bag.add(contentText(field(r, f.text, file)));
    else if (role != null) other++;
  }
  if (id == null) id = field({}, '$filename', file);
  if (!bag.count && !title) return null;
  if (!updatedAt) { try { updatedAt = fs.statSync(file).mtimeMs; } catch { /* ignore */ } }
  return {
    id: String(id), cwd: cwd ? String(cwd) : '', model: model ? String(model) : '',
    title: titleFrom(title, bag.first),
    startedAt: startedAt || updatedAt, updatedAt,
    messages: bag.count + other,
    firstPrompt: bag.first, lastPrompt: bag.last, text: bag.text,
  };
}

export function parseCustom(spec, file, raw = fs.readFileSync(file, 'utf8')) {
  const f = { ...DEFAULT_FIELDS, ...(spec.fields || {}) };
  if (spec.format === 'jsonl') {
    const recs = [];
    for (const line of raw.split('\n')) { if (line.trim()) { try { recs.push(JSON.parse(line)); } catch { /* skip */ } } }
    return fromMessages(file, f, recs);
  }
  let d;
  try { d = JSON.parse(raw); } catch { return null; }
  const msgs = Array.isArray(d) ? d : getPath(d, f.messages) || [];
  return fromMessages(file, f, msgs, Array.isArray(d) ? {} : d);
}

/** Fill `{id}`, `{cwd}`, `{title}` placeholders in the resume template. */
export function resumeFromTemplate(tpl) {
  return (s) => {
    const sub = (v) => String(v).replace(/\{(\w+)\}/g, (_, k) => (s[k] ?? ''));
    return {
      command: tpl.command,
      args: (tpl.args || ['{id}']).map(sub),
      cwd: tpl.cwd ? expandHome(sub(tpl.cwd)) : s.cwd,
    };
  };
}

export function validateSpec(spec) {
  const errs = [];
  if (!spec || typeof spec !== 'object') return ['agent entry must be an object'];
  if (!spec.name || !SAFE_ID.test(spec.name)) errs.push('`name` is required (letters, digits, - _ .)');
  if (!['jsonl', 'json', 'sqlite'].includes(spec.format)) errs.push('`format` must be "jsonl", "json" or "sqlite"');
  if (spec.format === 'sqlite') { if (!spec.db || !spec.query) errs.push('sqlite agents need `db` and `query`'); }
  else if (!spec.glob) errs.push('file agents need a `glob`');
  if (!spec.resume?.command) errs.push('`resume.command` is required');
  return errs;
}

export function customAgent(spec) {
  const resume = resumeFromTemplate(spec.resume);
  if (spec.format === 'sqlite') return { ...sqliteAgent(spec, resume), custom: true };
  return {
    name: spec.name, label: spec.label || spec.name, command: spec.resume.command, custom: true,
    location: () => expandHome(spec.glob),
    detect() { return this.files().length > 0 || exists(expandHome(spec.glob).split(/[*?]/)[0]); },
    files: () => glob(spec.glob),
    parse: (file) => parseCustom(spec, file),
    resume,
  };
}
