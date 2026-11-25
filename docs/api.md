---
title: JavaScript API
nav_order: 7
---

# JavaScript API

tracker is also an ES module you can import.

```js
import { sessions, resumeSpec, run, loadAgents } from '@ai-clyde/tracker';

// Newest first, every detected agent.
const all = sessions();

// Ranked by keywords, one agent, searching full transcripts.
const hits = sessions({ query: 'stripe webhook', agents: ['claude'], deep: true });

console.log(hits[0].title, hits[0].cwd, hits[0].resume);

// Launch it, attached to this terminal.
const { agents } = loadAgents();
await run(resumeSpec(hits[0], agents));
```

## `sessions(options?)`

| Option | Type | Default | |
|---|---|---|---|
| `query` | string | `''` | Keywords. When set, results are ranked and non-matches dropped |
| `agents` | string[] | all | Agent names to include |
| `deep` | boolean | `false` | Also match assistant replies and tool output |
| `all` | boolean | `false` | Include headless, cron, hidden and archived sessions |

Returns an array of:

```ts
{
  agent: string;        // "claude" | "codex" | "gemini" | "qwen" | "hermes" | custom name
  id: string;
  title: string;
  cwd: string;
  model: string;
  startedAt: number;    // ms since epoch
  updatedAt: number;
  messages: number;
  firstPrompt: string;
  lastPrompt: string;
  text: string;         // capped prompt text used for search
  file?: string;        // transcript path for file-based agents
  resume: string;       // copy-pasteable shell line
}
```

## `resumeSpec(session, agents)` and `run(spec)`

`resumeSpec` returns `{ command, args, cwd, cwdMissing }`. `run` spawns it with the terminal attached and resolves with the exit code.
