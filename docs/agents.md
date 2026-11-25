---
title: Supported agents
nav_order: 4
---

# Supported agents
{: .no_toc }

Run `tracker agents` to see which of these were found on your machine.

1. TOC
{:toc}

## Claude Code

| | |
|---|---|
| Store | `~/.claude/projects/<encoded-folder>/<session-id>.jsonl` (override with `CLAUDE_CONFIG_DIR`) |
| Title | Your `/rename` title, else Claude's auto title, else the first prompt |
| Resume | `claude --resume <id>`, run in the session's folder |

- Subagent transcripts are skipped. They live in nested folders and can't be resumed on their own.
- Headless runs (`claude -p`, Agent SDK, hooks) are hidden unless you pass `--all`.
- Tool results, system reminders, bare slash commands such as `/clear`, and other harness noise are stripped from prompts.

## OpenAI Codex CLI

| | |
|---|---|
| Store | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` (override with `CODEX_HOME`) |
| Title | First prompt (Codex doesn't store titles) |
| Resume | `codex resume <id>` |

Prompts come from `user_message` events. Older files without them fall back to user `message` items, ignoring injected `<environment_context>` blocks.

## Gemini CLI

| | |
|---|---|
| Store | `~/.gemini/tmp/<project>/chats/session-*.json` (override with `GEMINI_DIR`) |
| Folder | Resolved through `~/.gemini/projects.json`. Older hash-named project folders are matched by `sha256(path)` |
| Resume | `gemini --resume <id>` |

## Qwen Code

Qwen Code is a Gemini CLI fork under `~/.qwen` (override with `QWEN_DIR`). Both layouts are read:

- newer: `~/.qwen/projects/<folder>/chats/<id>.jsonl`, with the folder taken from the record's `cwd` or the sibling `<id>.runtime.json`. Runtime-only stubs with no conversation are skipped.
- older: `~/.qwen/tmp/<project>/chats/*.json` (same as Gemini CLI).

Resume: `qwen --resume <id>`.

## OpenCode

| | |
|---|---|
| Store | `opencode.db` (SQLite) in `OPENCODE_DATA_DIR`, else `$XDG_DATA_HOME/opencode`, else `~/.local/share/opencode` (on Windows too) |
| Title | OpenCode's title; the placeholder `New session - <date>` falls back to your first prompt |
| Resume | `opencode --session <id>` |

- Subagent child sessions (`parent_id` set) and archived sessions are hidden unless `--all`.
- Synthetic parts OpenCode injects (file contents, etc.) are not treated as prompts.
- `--deep` searches every message part with SQL.

## Cursor Agent CLI

| | |
|---|---|
| Store | `~/.cursor/chats/<hash>/<chat-id>/meta.json` + `prompt_history.json` (override with `CURSOR_DIR`) |
| Title | Cursor's chat title |
| Resume | `cursor-agent --resume <chat-id>` |

Chats with `hasConversation: false` are skipped.

## GitHub Copilot CLI

| | |
|---|---|
| Store | `~/.copilot/session-state/<id>.jsonl` event stream (override with `COPILOT_HOME`) |
| Resume | `copilot --resume <id>` |

## Aider

Aider has no central store: it writes `.aider.chat.history.md` into the folder you ran it in. tracker looks in your home folder, every folder any other agent has a session in (remembered across runs), and any extra folders you list in config:

```json
{ "aider": { "roots": ["~/code/project-a", "D:/work/project-b"] } }
```

One session per folder. Resume: `aider --restore-chat-history`, run in that folder.

## Hermes Agent

| | |
|---|---|
| Store | `state.db` (SQLite) in `HERMES_HOME`, else `%LOCALAPPDATA%\hermes` on Windows, else `~/.hermes` |
| Title | Hermes's own session title |
| Resume | `hermes --resume <id>` |

- Cron, hidden and archived sessions are excluded unless you pass `--all`.
- The database is opened read-only, and only columns that exist are queried, so older and newer Hermes schemas both work.
- `--deep` searches every message (assistant and tool output too) with SQL.

## Something else?

Any tool that stores sessions as JSONL, JSON or SQLite can be added without code. See [Custom agents](custom-agents). If you'd like an agent built in, [open an issue](https://github.com/PyMite6941/tracker/issues) with a redacted sample session file.

{: .note }
Codex and Copilot CLI support follows those tools' documented on-disk formats and is covered by fixture tests (no real sessions were available to check against). If your version writes something different, `tracker agents` will show 0 sessions; please open an issue.
