# TaskManager

Personal task manager that auto-sorts tasks by priority. Self-hosted cheaply (author's laptop / small VPS): one Go binary (or container) serves both the API and the built frontend. Web/PWA first.

Talk to the user in Russian. Agent docs (this file, skills, agent briefs) are English.

## Priority formula

```
Pt = Pg * Te / Tl * %in
```

`Pg` group weight (`Task.GroupPriorty` ← `Group.GroupPriority`, 1–10) · `Te` time to execute, minutes (`TimeForExecution`) · `Tl` hours until deadline (`NumberOfHoursUntilDL`, recomputed from now on every change, overdue → 1) · `%in` = `(100 - PercentOfCompleting) / 100`. Implemented in `calculateTaskPriorty`, `internal/services/task_services.go`. Task lists are always shown sorted by `Priority` desc.

Entities: **Task** (status 1 active / 2 done; `Status = 2` ⇔ 100%), **Group** (weight 1–10, `GroupId = 0` = no group), **Day** (day plan: minutes per task in `Day.Slots`), **NotificationSettings** / push subscriptions. No users/auth yet — `userId` is passed explicitly.

## Layout

```
cmd/taskManager/main.go   wiring, gin on :8080, reminder scheduler, graceful shutdown
internal/models/          GORM models + request DTOs (*CreateRequest, *UpdateRequest)
internal/repository/      DB access: GenericRepository[T] + specific queries; migrations.go
internal/services/        business logic, errors.go (business errors), day_plan.go, reminders.go (pure rules)
internal/api/handlers/    gin handlers; errors.go (respondError / respondBindingError)
internal/api/routes.go    all routes, under /api
internal/api/spa.go       serves embedded frontend, SPA fallback to index.html
internal/config/          config.yaml loader (not wired into main yet)
web/                      Vite + React + TS frontend; web/embed.go embeds web/dist
design/                   design system + screen mockups (owned by the designer agent)
```

Layers are strict: handler → service → repository. Handlers never touch the DB; repositories hold no business logic.

## Commands

```bash
go build ./... && go vet ./... && go test ./...      # backend check
cd web && npm test && npm run build && npm run lint  # frontend check
docker compose up -d db                              # Postgres only: localhost:5434, postgres/12345678, task_manager_db
DB_HOST=localhost DB_PORT=5434 DB_USER=postgres DB_PASSWORD=12345678 DB_NAME=task_manager_db go run ./cmd/taskManager
cd web && npm run dev                                # Vite, proxies /api → :8080
```

Run the checks above before calling a task done.

## Code rules

- Identifiers in English; comments, logs and error messages in Russian (match existing code).
- Wrap errors: `fmt.Errorf("...: %w", err)`. Log with `log/slog`, structured fields.
- API contract: requests camelCase, responses are model fields as-is (PascalCase, models have no json tags) — change only together with `web/src/api/types.ts`. Errors are `{"error": "..."}`; empty lists are `[]`.
- Time-dependent logic takes `now` as a parameter (testable).
- Commits: small, one logical change, English messages. Gitflow — never commit to `develop`/`main` directly.

## Where to look

- `api-reference` skill — endpoint table, response quirks, Day slots, push/VAPID, reminders, timezones.
- `add-endpoint` skill — adding or changing an endpoint layer by layer.
- `frontend-conventions` skill — anything in `web/`.
- `design-system` skill — `design/` structure, tokens, screen specs.
- `agent-workflow` skill — coordinator pipeline: branches, subagents, tests, review, merge.
- `ops` skill — Docker, worktrees, PWA, Tailscale/phone access.
