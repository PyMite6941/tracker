// Helpers shared by every agent adapter.
import { oneLine } from '../util.js';

export const TEXT_CAP = 12000; // chars of prompt text kept per session for keyword search

/**
 * Turn a raw user message into something worth showing/searching, or '' to drop it.
 * Strips harness noise (system reminders, slash-command wrappers, injected context).
 */
export function cleanPrompt(raw) {
  let s = String(raw ?? '');
  if (!s.trim()) return '';
  s = s.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, ' ');
  const cmd = s.match(/<command-name>([\s\S]*?)<\/command-name>/);
  if (cmd) {
    const args = s.match(/<command-args>([\s\S]*?)<\/command-args>/);
    s = `${cmd[1].trim()} ${args ? args[1].trim() : ''}`;
  }
  s = s.replace(/<\/?pasted_content[^>]*>/g, ' ');
  const t = s.trim();
  if (!t) return '';
  if (/^\/[\w:-]+$/.test(t)) return ''; // bare slash command (/clear, /model) says nothing about the topic
  if (/^<(local-command|command-|environment_context|user_instructions|user-prompt-submit-hook|task-notification)/.test(t)) return '';
  if (/^\[Request interrupted/.test(t)) return '';
  if (/^Caveat: The messages below were generated/.test(t)) return '';
  return t;
}

/** Accumulate prompts into a session record: first/last prompt, capped search text, counts. */
export class PromptBag {
  constructor() { this.first = ''; this.last = ''; this.parts = []; this.len = 0; this.count = 0; }
  add(raw) {
    const p = cleanPrompt(raw);
    if (!p) return false;
    this.count++;
    if (!this.first) this.first = p;
    this.last = p;
    if (this.len < TEXT_CAP) {
      const piece = p.slice(0, 2000);
      this.parts.push(piece);
      this.len += piece.length;
    }
    return true;
  }
  get text() { return this.parts.join('\n'); }
}

export function titleFrom(...candidates) {
  for (const c of candidates) {
    const t = oneLine(c);
    if (t) return t.length > 120 ? t.slice(0, 119) + '…' : t;
  }
  return '(untitled)';
}

export const SAFE_ID = /^[A-Za-z0-9._:@+-]+$/;
