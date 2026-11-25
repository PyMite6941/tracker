---
title: The picker (TUI)
nav_order: 3
---

# The picker

Run `tracker` with no arguments, or with keywords to start pre-filtered. It opens full-screen in your terminal's alternate buffer, so your scrollback is left untouched.

```text
 tracker 12/202 sessions                                    agent:all  folder:any  sort:relevance
 ❯ stripe webhook
──────────────────────────────────────────────────────────────────────────────────────────────
 ▸ claude  2h ago   Stripe refund webhook                              …/work/payments-api
   codex   3d ago   Verify webhook signatures in middleware            …/work/payments-api
──────────────────────────────────────────────────────────────────────────────────────────────
 Stripe refund webhook
 claude · 3f1c…e2 · 48 msgs · claude-opus-5-5
 dir   ~/work/payments-api
 first Add a Stripe webhook handler for refunds
 last  now write tests for it
```

The bottom panel previews the highlighted session: its id, message count, model, directory, and the first and last thing you asked.

## Keys

| Key | Action |
|---|---|
| *typing* | Filter (every word must match) |
| `↑` `↓` / `Ctrl-P` `Ctrl-N` | Move |
| `PgUp` `PgDn` `Home` `End` | Jump |
| `Enter` | Resume the highlighted session |
| `Tab` / `Shift-Tab` | Cycle the agent filter: all → claude → codex → … |
| `Ctrl-F` | Toggle *only sessions from this folder* |
| `Ctrl-S` | Toggle sort: relevance ↔ most recent |
| `Ctrl-O` | Exit and print the resume command instead of running it |
| `Backspace` / `Ctrl-W` / `Ctrl-U` | Delete a character / word / the whole query |
| `Esc` / `Ctrl-C` | Quit |

Wide characters (CJK paths and titles) and emoji are measured correctly, so columns stay aligned.
