---
name: frontend-conventions
description: TaskManager frontend conventions (Vite + React + TypeScript in web/) — folder layout, API client and types, styling on design tokens, tests, build and embedding into the Go binary. Use for any work in web/.
---

# TaskManager frontend

## Stack

- Vite + React + TypeScript (strict). No UI kits or CSS frameworks — styles are built on tokens from `design/tokens.css`.
- Routing `react-router-dom`, server state `@tanstack/react-query`. A new dependency only when it clearly saves complexity — justify it in the report.
- Tests: Vitest (`npm test`), pure logic in `web/src/lib/*.test.ts`. Lint: oxlint (`npm run lint`).

## Layout

```
web/src/
  api/          client.ts (fetch wrapper), types.ts (API response types), one file per resource (tasks, groups, days, push, notifications), user.ts
  components/   reusable components, one per file, styles beside: Component.module.css
  pages/        screens — one per mockup in design/screens/
  hooks/        react-query hooks (useTasks, useTaskMutations, ...), queryKeys.ts
  lib/          pure logic and formatting (+ tests)
  styles/       tokens.css (copy of design/tokens.css), global.css
  sw.ts         service worker (see `ops` skill)
```

- `web/src/styles/tokens.css` is a copy of `design/tokens.css` — update it whenever the design tokens change.
- CSS Modules; values only via `var(--...)`, no hard-coded colours or sizes.

## API

- Every request goes through `api/client.ts`: base path from `import.meta.env.VITE_API_URL` (default empty — same origin), JSON, `{"error": "..."}` becomes an `Error` with that text.
- `/api` is prepended once in `BASE_URL` in `client.ts`; resource files write paths without it (`/tasks/user/1`). In dev Vite proxies `/api` to `http://localhost:8080`.
- `api/types.ts` mirrors the **real** Go response fields (`TaskId`, `DeadLine`, `Priority`...); requests are camelCase like the `*Request` DTOs. Check against `internal/models/` and the `api-reference` skill.
- `userId` is explicit (no auth): single source `api/user.ts`, `CURRENT_USER_ID = 1`.
- Sorting tasks by `Priority` desc lives in one helper, not in components.

## Embedding into Go

Already set up: `npm run build` writes `web/dist` (a plugin in `vite.config.ts` keeps `dist/.gitkeep`); `web/embed.go` embeds it with `//go:embed`; `internal/api/spa.go` serves files with `index.html` fallback for SPA paths. API lives under `/api`, so SPA routes (`/day`, `/tasks/:id`, ...) never collide.

## Check

```bash
cd web && npm test && npm run build && npm run lint   # build includes tsc — zero type errors
```
