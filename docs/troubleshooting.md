---
title: Troubleshooting
nav_order: 6
---

# Troubleshooting

### An agent shows "not found"

Run `tracker agents`. The last column shows the exact path tracker looked in. If your agent keeps its data somewhere else, set the matching environment variable (see [Usage](usage#environment-variables)) or override the agent in [config](custom-agents).

### "… is not on your PATH"

tracker found the session but can't launch the agent. Install the agent, or use `--print` to get the command and run it however you normally do.

### The first run is slow

The first index reads every transcript. A heavy Claude Code user can have several hundred MB of them. After that, only files that changed are re-read, so later runs take about a second. Delete the cache with `tracker reindex`.

### A session I know exists doesn't show up

- Headless runs (`claude -p`, hooks) and Hermes cron/hidden/archived sessions are hidden by default. Add `--all`.
- `-H` limits results to the current folder. Drop it.
- Normal search only looks at **your prompts** and titles. Add `--deep` to search the agent's replies too.
- Sessions with no real user message (empty or metadata-only files) are skipped.

### The resume opened a different session / "no conversation found"

Agents scope history by folder, so tracker always launches from the session's original folder. If that folder was moved or deleted, you'll see a warning, and the agent may not find the session. Move the folder back, or run `tracker show <id>` to get the id and folder.

### Debugging

```sh
TRACKER_DEBUG=1 tracker list     # print parse warnings and stack traces
tracker list --json | less       # see exactly what was indexed
```

### Privacy

tracker reads local files only. It makes no network requests and writes nothing except its own cache: `%LOCALAPPDATA%\tracker` on Windows, `~/Library/Caches/tracker` on macOS, `~/.cache/tracker` on Linux. The cache holds titles, folders and up to about 12 KB of your prompts per session, so treat it like the transcripts themselves.
