// Programmatic API: `import { sessions } from '@pymite6941/tracker'`.
import { loadAgents } from './agents/index.js';
import { collect } from './store.js';
import { rank, deepMatch } from './search.js';
import { resumeSpec, shellLine } from './resume.js';

export { BUILTINS, loadAgents } from './agents/index.js';
export { rank, deepMatch } from './search.js';
export { resumeSpec, shellLine, run } from './resume.js';

/** All sessions (newest first), optionally filtered by agent names and ranked by a query. */
export function sessions({ agents: names = [], query = '', deep = false, all = false } = {}) {
  const { agents } = loadAgents();
  const active = names.length ? agents.filter((a) => names.includes(a.name)) : agents;
  let list = collect(active, { all }).sessions;
  if (deep && query) deepMatch(list, active, query);
  if (query) list = rank(list, query);
  return list.map((s) => ({ ...s, resume: shellLine(resumeSpec(s, agents)) }));
}
