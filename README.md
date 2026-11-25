<p align="center">
  <img src="assets/logo.svg" width="112" alt="tracker logo">
</p>

<h1 align="center">tracker</h1>

<p align="center">
  Find and resume your AI coding-agent sessions by keyword or recency, across every agent, from one CLI/TUI.
  <br>
  <a href="https://pymite6941.github.io/tracker/">Documentation</a> ·
  <a href="https://www.npmjs.com/package/@pymite6941/tracker">npm</a> ·
  <a href="https://github.com/PyMite6941/tracker/issues">Issues</a>
</p>

---

You've had forty Claude Code, Codex, Gemini and Hermes sessions this week, spread across twenty folders. You remember *what* you were doing ("the stripe webhook thing") but not *where* or *which agent*. `tracker` reads each agent's own session store, indexes them, and drops you back into the right one, in the right directory, with one keystroke.

```text
 tracker 12/202 sessions                                    agent:all  folder:any  sort:relevance
 ❯ stripe webhook
──────────────────────────────────────────────────────────────────────────────────────────────
 ▸ claude  2h ago   Stripe refund webhook                              …/work/payments-api
   codex   3d ago   Verify webhook signatures in middleware            …/work/payments-api
   hermes  9d ago   Plan Stripe → Paddle migration                     …/work/billing
──────────────────────────────────────────────────────────────────────────────────────────────
 Stripe refund webhook
 claude · 3f1c…e2 · 48 msgs · claude-opus-5-5
 dir   ~/work/payments-api
 first Add a Stripe webhook handler for refunds
 last  now write tests for it
 ↑↓ move · Enter resume · Tab agent · ^F this folder · ^S sort · ^O print cmd · Esc quit
```

## Install

```sh
npm install -g @pymite6941/tracker     # gives you `tracker` (and the short alias `trk`)
```

Requires Node.js **22.13+** (it uses the built-in `node:sqlite`). No other dependencies.

## Use

| Command | What it does |
|---|---|
| `tracker` | Interactive picker. Type to filter, ↑↓ to move, Enter to resume. |
| `tracker stripe webhook` | Picker pre-filtered by keywords. |
| `tracker last` | Resume the most recent session from any agent. |
| `tracker last claude` | Resume the most recent session from one agent. |
| `tracker resume <id \| words>` | Resume by id, id prefix, or best keyword match. |
| `tracker list [words]` | Print sessions as a table (newest first, or ranked). |
| `tracker show <id \| words>` | Details, first/last prompt and the exact resume command. |
| `tracker agents` | Which agents were found, where, and how many sessions each has. |

Useful flags: `-a claude,codex` (only these agents), `-H` (only sessions from this folder), `--deep` (also search assistant replies and tool output), `--print` (show the resume command instead of running it), `--json`.

## Supported agents

| Agent | Reads | Resumes with |
|---|---|---|
| Claude Code | `~/.claude/projects/*/*.jsonl` | `claude --resume <id>` |
| OpenAI Codex CLI | `~/.codex/sessions/**/rollout-*.jsonl` | `codex resume <id>` |
| Gemini CLI | `~/.gemini/tmp/*/chats/*.json` | `gemini --resume <id>` |
| Qwen Code | `~/.qwen/tmp/*/chats/*.json` | `qwen --resume <id>` |
| Hermes Agent | `state.db` (SQLite) | `hermes --resume <id>` |
| **Anything else** | JSONL, JSON or SQLite. [Describe it in config](https://pymite6941.github.io/tracker/custom-agents) | your command template |

Each resume runs in the session's original working directory, so the agent finds its own history.

### Add your own agent

```sh
tracker config --init      # writes a commented example config
```

```json
{
  "agents": [{
    "name": "myagent",
    "format": "jsonl",
    "glob": "~/.myagent/sessions/**/*.jsonl",
    "fields": { "id": "$filename", "cwd": "cwd", "timestamp": "ts", "role": "role", "text": "content" },
    "resume": { "command": "myagent", "args": ["--resume", "{id}"], "cwd": "{cwd}" }
  }]
}
```

See the [custom agents guide](https://pymite6941.github.io/tracker/custom-agents) for every field.

## How it works

- **Read-only.** tracker never writes to an agent's files or databases; SQLite stores are opened read-only.
- **Fast after the first run.** Parsed sessions are cached by file mtime and size, so later runs only re-read transcripts that changed. The first index of a large Claude history (hundreds of MB) takes a few seconds.
- **Ranking.** Every keyword must match somewhere. Title hits count most, then folder name, then prompts. Recent sessions get a small boost.
- **Local only.** Nothing leaves your machine.

## Programmatic use

```js
import { sessions } from '@pymite6941/tracker';
const [best] = sessions({ query: 'stripe webhook' });
console.log(best.title, best.resume); // "Stripe refund webhook", "cd … && claude --resume …"
```

## License

MIT
