---
title: Usage
nav_order: 2
---

# Usage
{: .no_toc }

1. TOC
{:toc}

## Commands

| Command | Description |
|---|---|
| `tracker` | Open the [interactive picker](tui). Falls back to `list` when stdin/stdout isn't a terminal. |
| `tracker <words…>` | Picker pre-filtered by `words`. |
| `tracker last [agent]` | Resume the most recently active session, optionally from one agent. |
| `tracker resume <id \| words…>` | Resume by exact id, unique id prefix (4+ chars), or the best keyword match. Alias: `r`. |
| `tracker list [words…]` | Print a table: newest first, or ranked by `words`. Aliases: `ls`, `search`, `s`. |
| `tracker show <id \| words…>` | Show one session's details, its first and last prompt, and the exact resume command. |
| `tracker agents` | List every known agent, whether its store was found, its session count, and whether its command is on your `PATH`. |
| `tracker config [--init]` | Print the config and cache paths, or write an example config. |
| `tracker reindex` | Delete the cache and rescan everything. |

## Options

| Flag | Meaning |
|---|---|
| `-a, --agent <names>` | Only these agents. Repeat the flag or comma-separate: `-a claude,codex`. |
| `-H, --here` | Only sessions whose working directory is the current folder or below it. |
| `-s, --since <when>` | Only sessions active since `today`, `yesterday`, `24h`, `7d`, `2w`, `3m` or a date like `2026-11-01`. In the picker this only sets the starting range; `Ctrl-T` changes it. |
| `-t, --today` | Same as `--since today`. |
| `-n, --limit <n>` | Rows to print in `list` (default 20). |
| `--deep` | Also match words that appear only in assistant replies or tool output (reads full transcripts, so it's slower). |
| `--all` | Include sessions agents mark as background: headless `claude -p` runs, Hermes cron/hidden/archived sessions. |
| `--print` | Print the resume command instead of running it (also `--dry-run`). |
| `--json` | Machine-readable output for `list`, `show`, `agents`, and `last`/`resume` with `--print`. |
| `--no-cache` | Ignore the index cache for this run. |
| `--no-color` | Plain output. `NO_COLOR` is honoured too. |

## Searching

Keywords are case-insensitive, and **every** keyword must match somewhere in the session. Matches are weighted:

| Where the word appears | Weight |
|---|---|
| Session id prefix | highest |
| Title (the agent's own title, or the first prompt) | high |
| Folder name of the working directory | medium |
| First or last prompt | medium |
| Any other prompt you typed | low |
| Agent name (`claude`, `hermes`, …) | medium |

Recent sessions get a small boost, so when two sessions match equally well, the one from this morning wins over the one from March.

Normal search looks at **your prompts**, not the agent's replies. Use `--deep` when the word only appears in an answer or a tool output.

## Resuming

tracker runs the agent's own resume command with the terminal attached, **from the directory the session was started in**. That matters: Claude Code, Codex and Gemini scope history by folder. If that folder no longer exists, tracker warns you and launches from the current directory instead.

To see the command without running it:

```sh
$ tracker resume webhook --print
cd '/home/me/work/payments-api' && claude --resume 3f1c0a9e-…
```

Scripting:

```sh
cd "$(tracker last codex --print --json | jq -r .resume.cwd)"
tracker list --json -n 100 | jq '.[] | select(.agent=="hermes") | .title'
```

## Environment variables

| Variable | Effect |
|---|---|
| `TRACKER_CONFIG` | Path to the config file. |
| `TRACKER_CACHE_DIR` | Where the index cache is stored. |
| `TRACKER_DEBUG` | Print parse warnings and stack traces. |
| `CLAUDE_CONFIG_DIR` | Claude Code config dir (default `~/.claude`). |
| `CODEX_HOME` | Codex home (default `~/.codex`). |
| `GEMINI_DIR` / `QWEN_DIR` | Gemini / Qwen data dir (default `~/.gemini`, `~/.qwen`). |
| `OPENCODE_DATA_DIR` | OpenCode data dir holding `opencode.db` (default `$XDG_DATA_HOME/opencode` or `~/.local/share/opencode`). |
| `CURSOR_DIR` | Cursor dir (default `~/.cursor`). |
| `COPILOT_HOME` | Copilot CLI dir (default `~/.copilot`). |
| `HERMES_HOME` | Hermes home (default `%LOCALAPPDATA%\hermes` on Windows, `~/.hermes` elsewhere). |
| `NO_COLOR` | Disable colours. |
