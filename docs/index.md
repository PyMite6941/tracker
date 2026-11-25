---
title: Home
layout: home
nav_order: 1
---

<img src="{{ '/assets/logo.svg' | relative_url }}" width="96" alt="tracker logo">

# tracker

Find and resume your AI coding-agent sessions by keyword or recency, across every agent, from one CLI/TUI.
{: .fs-6 .fw-300 }

[Get started](#install){: .btn .btn-primary .mr-2 } [View on GitHub](https://github.com/PyMite6941/tracker){: .btn }

---

Coding agents each keep their own history, in their own format, scoped to the folder you started them in. Once you have a few dozen sessions across Claude Code, OpenCode, Cursor, Aider and Hermes, finding "the one where I was fixing the webhook" means remembering which agent, which folder and which id.

`tracker` reads every agent's session store, builds one index, and resumes the session you pick **in its original directory**.

## Install

```sh
npm install -g @clyde-ai/tracker
```

Needs Node.js 22.13 or newer. There are no other dependencies. You get two commands: `tracker` and its short alias `trk`.

## 30-second tour

```sh
tracker                    # interactive picker: type, ↑↓, Enter
tracker stripe webhook     # picker pre-filtered by keywords
tracker last               # resume the newest session, any agent
tracker last hermes        # newest Hermes session
tracker resume a1b2c3d4    # by id or id prefix
tracker -H                 # only sessions started in this folder
tracker agents             # what was detected, and where
```

## Next

- [Usage](usage) covers every command and flag.
- [The picker (TUI)](tui) lists the keyboard shortcuts.
- [Supported agents](agents) explains where each agent's sessions live and how they're resumed.
- [Custom agents](custom-agents) shows how to add any other tool through config.
- [Troubleshooting](troubleshooting)
