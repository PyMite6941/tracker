// Agent registry: built-ins + whatever the user declares in config.json.
import fs from 'node:fs';
import { configPath } from '../util.js';
import claude from './claude.js';
import codex from './codex.js';
import gemini, { qwen } from './gemini.js';
import { hermes } from './sqlite.js';
import opencode from './opencode.js';
import cursor from './cursor.js';
import copilot from './copilot.js';
import aider from './aider.js';
import { customAgent, validateSpec } from './custom.js';

// Aider stays last: it discovers its history files from the folders the other agents found.
export const BUILTINS = [claude, codex, gemini, qwen, opencode, cursor, copilot, hermes, aider];

export function readConfig(file = configPath()) {
  if (!fs.existsSync(file)) return { file, config: {}, errors: [] };
  try {
    const config = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { file, config, errors: [] };
  } catch (e) {
    return { file, config: {}, errors: [`${file}: ${e.message}`] };
  }
}

/**
 * All agents tracker knows about. Config can add agents, override a built-in by reusing its
 * name, or switch built-ins off with "disable": ["qwen"].
 */
export function loadAgents({ config = readConfig() } = {}) {
  const errors = [...config.errors];
  const disabled = new Set(config.config.disable || []);
  const byName = new Map(BUILTINS.map((a) => [a.name, a]));
  for (const [i, spec] of (config.config.agents || []).entries()) {
    const errs = validateSpec(spec);
    if (errs.length) { errors.push(`agents[${i}]${spec?.name ? ` (${spec.name})` : ''}: ${errs.join('; ')}`); continue; }
    byName.set(spec.name, customAgent(spec));
  }
  const agents = [...byName.values()].filter((a) => !disabled.has(a.name));
  return { agents, errors, configFile: config.file, config: config.config };
}
