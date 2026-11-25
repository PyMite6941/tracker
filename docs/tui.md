---
title: The picker (TUI)
nav_order: 3
---

# The picker

Run `tracker` with no arguments, or with keywords to start pre-filtered. It opens full-screen in your terminal's alternate buffer, so your scrollback is left untouched.

```text
 ◆ tracker  3 of 202 sessions               agent all  date last 30d  folder any  sort relevance
  ❯ stripe webhook                                                                          1/3
 ───────────────────────────────────────────────────────────────────────────────────────────────
 ▌ ● claude     2h ago   Stripe refund webhook                          …/work/payments-api
   ● codex      3d ago   Verify webhook signatures in middleware        …/work/payments-api
   ● hermes     9d ago   Plan Stripe → Paddle migration                 …/work/billing
 ╭─ Stripe refund webhook ─────────────────────────────────────────────────────────────────────╮
 │ ● claude  ·  48 msgs  ·  2h ago  ·  claude-opus-5-5                                          │
 │ folder ~/work/payments-api                                                                   │
 │ first  Add a Stripe webhook handler for refunds                                              │
 │ last   now write tests for it                                                                │
 │ id     3f1c9a2e-…                                                                            │
 ╰──────────────────────────────────────────────────────────────────────────────────────────────╯
  ↑↓ move   ⏎ resume   ⇥ agent   ^T date   ^F folder   ^S sort   ^O print   esc quit
```

Each agent has its own colour, words you typed are highlighted in titles, and the boxed panel previews the highlighted session: agent, message count, age, model, folder, the first and last thing you asked, and its id. The chips in the top-right show the active filters.

## Keys

| Key | Action |
|---|---|
| *typing* | Filter (every word must match) |
| `↑` `↓` / `Ctrl-P` `Ctrl-N` | Move |
| `PgUp` `PgDn` `Home` `End` | Jump |
| `Enter` | Resume the highlighted session |
| `Tab` / `Shift-Tab` | Cycle the agent filter: all → claude → codex → … |
| `Ctrl-T` | Cycle the date filter: any → today → last 24h → 7d → 30d → 90d (starts from `--since` if you gave one) |
| `Ctrl-F` | Toggle *only sessions from this folder* |
| `Ctrl-S` | Toggle sort: relevance ↔ most recent |
| `Ctrl-O` | Exit and print the resume command instead of running it |
| `Backspace` / `Ctrl-W` / `Ctrl-U` | Delete a character / word / the whole query |
| `Esc` / `Ctrl-C` | Quit |

Wide characters (CJK paths and titles) and emoji are measured correctly, so columns stay aligned.
