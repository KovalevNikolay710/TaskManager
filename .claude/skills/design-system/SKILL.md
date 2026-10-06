---
name: design-system
description: TaskManager design system — where tokens, components, foundations, rules and screen specs live in design/, UI rules, and the screen-spec template. Use when creating or changing mockups in design/ or implementing a screen from them.
---

# TaskManager design system

## Files

Read the index, then only what the task needs.

- `design/system.md` — **index**: principles, one line per component, links to everything below. Keep it ≤ 6 KB.
- `design/tokens.css` — the only source of values (colour, type, spacing, radii, shadows, sizes), light + dark. `design/components.css` — reference markup/CSS for component classes (`.mock-panel` is mockup-only).
- `design/components/<Name>.md` — one per component: purpose, anatomy, variants, states, classes/tokens, behaviour, a11y.
- `design/foundations/*.md` — cross-cutting: layout and screen map, weight scale ×1…×10, formats, icons.
- `design/rules/*.md` — precise rules that code cites (day-plan allocation, ladder insertion, quick-add defaults, task-form validation, reminders, push states). Code comments link here; when a rule changes, keep the file name stable.
- `design/screens/<screen>.html` (mockup, exact copy) + `design/screens/<screen>.md` (spec).

Agent-facing text is concise English; Russian UI strings stay verbatim in quotes.

## Tokens

Naming: `--color-*`, `--font-*`, `--text-*` (sizes), `--space-*` (4px scale: 4, 8, 12, 16, 24, 32, 48), `--radius-*`, `--shadow-*`, `--size-*`. Colours are semantic (`--color-bg`, `--color-surface`, `--color-text`, `--color-text-muted`, `--color-border`, `--color-accent`, `--color-danger`, `--color-success`, priority and `--color-weight-1…10` scales). Dark theme overrides colour tokens under `@media (prefers-color-scheme: dark)` and `[data-theme="dark"]`. After changing tokens, `web/src/styles/tokens.css` must be re-copied (developer).

## Screen spec

Implemented screens: the code in `web/src` is the source of truth and `screens/<screen>.md` is a ≤ 3 KB summary. For a **new** screen or change, write only what the developer needs to build it:

```markdown
# <Screen> — route `/path`

## Purpose
One or two sentences.

## Data
| Shown | Endpoint | Response field | Format |

## Components
Links to `../components/*.md`; new components get their own file (and an index line).

## States
Loading / empty / error / others — one line each.

## Actions
| User action | Request (endpoint, body) | Result in UI |

## Desktop
Differences from mobile.

## Needs from backend
What the current API lacks (check the `api-reference` skill), or "nothing".
```

Long precise rules (algorithms, validation, notification texts) go to `design/rules/<topic>.md`, linked from the spec.
