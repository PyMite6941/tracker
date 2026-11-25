---
title: Custom agents
nav_order: 5
---

# Custom agents
{: .no_toc }

Teach tracker about any coding agent, chat app or script that saves sessions to disk, without writing code.

1. TOC
{:toc}

## The config file

```sh
tracker config          # prints where it lives
tracker config --init   # writes an example you can edit
```

| OS | Default path |
|---|---|
| Windows | `%APPDATA%\tracker\config.json` |
| macOS / Linux | `$XDG_CONFIG_HOME/tracker/config.json` (usually `~/.config/tracker/config.json`) |

Set `TRACKER_CONFIG` to use another file. A [JSON Schema]({{ '/config.schema.json' | relative_url }}) is published for editor autocompletion.

```json
{
  "$schema": "https://pymite6941.github.io/tracker/config.schema.json",
  "disable": ["qwen"],
  "agents": [ … ]
}
```

- `disable` turns off built-in agents you don't use.
- `agents` adds new agents. Reusing a built-in name (for example `"claude"`) **replaces** that built-in.

Run `tracker agents` after editing. Config errors are printed there and never stop the other agents from loading.

## JSONL agents (one record per line)

```json
{
  "name": "myagent",
  "label": "My Agent",
  "format": "jsonl",
  "glob": "~/.myagent/sessions/**/*.jsonl",
  "fields": {
    "id": "$filename",
    "cwd": "cwd",
    "title": "title",
    "timestamp": "ts",
    "role": "message.role",
    "text": "message.content",
    "userRole": "user"
  },
  "resume": { "command": "myagent", "args": ["--resume", "{id}"], "cwd": "{cwd}" }
}
```

Each file is one session. Every line is a record, and `fields` says where to find things in each record.

## JSON agents (one file per session)

```json
{
  "name": "otheragent",
  "format": "json",
  "glob": "~/.otheragent/chats/*.json",
  "fields": { "id": "id", "cwd": "workspace", "title": "title", "messages": "messages",
              "role": "role", "text": "content", "timestamp": "createdAt" },
  "resume": { "command": "otheragent", "args": ["chat", "--session", "{id}"] }
}
```

`fields.messages` points at the array of messages inside the file. The other fields are read from the top-level object first, then from each message. If the file *is* an array, it is treated as the messages.

## SQLite agents

```json
{
  "name": "dbagent",
  "format": "sqlite",
  "db": "~/.dbagent/state.db",
  "query": "SELECT id, title, cwd, created_at AS started_at, updated_at, message_count AS messages, first_prompt FROM sessions",
  "resume": { "command": "dbagent", "args": ["--continue", "{id}"] }
}
```

The database is opened read-only. Your `query` must return an `id` column. These columns are also recognised: `title`, `cwd`, `model`, `started_at`, `updated_at`, `messages`, `first_prompt`, `last_prompt`, `text`. Timestamps can be ISO strings, Unix seconds or Unix milliseconds.

## Field reference

| Field | Default | Meaning |
|---|---|---|
| `id` | `sessionId` | Session id passed to the resume command |
| `cwd` | `cwd` | Folder the session ran in |
| `title` | `title` | Display title (falls back to the first prompt) |
| `timestamp` | `timestamp` | Per-record time; the earliest and latest give started/updated |
| `startedAt` / `updatedAt` | same names | Top-level times (JSON format) |
| `model` | `model` | Model name, shown in the preview |
| `role` | `role` | Where the speaker is stored |
| `userRole` | `"user"` | Value (or array of values) of `role` that means *you* |
| `text` | `content` | Message text: a string, `[{text}]` parts, or `{text}` |
| `messages` | `messages` | JSON format only: path to the messages array |

Paths are dotted (`message.content`, `payload.items.0.text`). Three pseudo-fields are available:

- `$filename` gives the file name without its extension.
- `$dirname` gives the name of the folder holding the file.
- `$parent` gives the full path of that folder.

`glob` supports `*`, `?` and `**`, plus `~`, `${VAR}` and `%VAR%`.

## Resume template

| Key | Meaning |
|---|---|
| `command` | Executable to run (looked up on `PATH`) |
| `args` | Arguments. `{id}`, `{cwd}`, `{title}`, `{agent}` are substituted |
| `cwd` | Folder to run in. Defaults to the session's folder |

On Windows, commands are started through `cmd.exe` so `.cmd` shims work. Arguments containing shell metacharacters are refused.
