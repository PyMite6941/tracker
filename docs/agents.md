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

Qwen Code is a Gemini CLI fork that uses the same layout under `~/.qwen` (override with `QWEN_DIR`). Resume: `qwen --resume <id>`.

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
Codex and Qwen support follows those tools' documented on-disk formats and is covered by fixture tests. If your version writes something different, `tracker agents` will show 0 sessions; please open an issue.
