---
name: ops
description: Running and shipping TaskManager — Docker/compose, single-binary build, running a branch from a worktree, PWA/service worker, phone access over Tailscale. Use when starting the app, building the image, testing on a phone, or debugging Docker/PWA/push setup.
---

# Ops

## Run

```bash
docker compose up -d db          # Postgres only (localhost:5434), for `go run` / Vite dev
docker compose up --build        # whole app: http://localhost:8080 (UI + API)
```

- Compose v2 only: `docker compose`, never `docker-compose` (a hook blocks v1).
- DB and app containers use `TZ=Europe/Moscow`; data persists in volume `db_data`.
- **Worktree branches** run as the same project: `docker compose -p taskmanager up --build` from the worktree dir. Without `-p` the project is named after the directory: `container_name: manager_db` collides, and the DB would be a fresh empty one.

## Integration tests

Service-level tests run against a real Postgres and are skipped without `TEST_DATABASE_URL`. Create the DB once: `docker exec manager_db psql -U postgres -c "CREATE DATABASE task_manager_test"`; then run with `TEST_DATABASE_URL="host=localhost port=5434 user=postgres password=12345678 dbname=task_manager_test sslmode=disable" go test ./...`. Tables are truncated per test, so DB tests live in one package (`internal/services`) and never use `t.Parallel`.

## Single binary

`cd web && npm run build`, then `go build ./...` — `web/embed.go` embeds `web/dist`. Without a frontend build Go still compiles (`web/dist/.gitkeep` is committed) but serves only the API.

Dockerfile stages: `node:lts-alpine` (frontend) → `golang` (binary) → `alpine`.
- No `# syntax=` directive on purpose: Docker 23+ supports `RUN --mount` natively, and the directive forces a Docker Hub pull of `docker/dockerfile` on every build.
- `npm ci` uses a cache mount plus long fetch retries to survive flaky networks.

## PWA

- `npm run build` (vite-plugin-pwa, `injectManifest`) generates `manifest.webmanifest` and `sw.js` from `web/src/sw.ts`: precaches the shell, falls back to `index.html`, `/api` is network-only. The SW is not registered in `npm run dev`.
- Icons in `web/public/icons/` (SVG from `design/icons` + PNG 192/512/maskable/apple-touch/badge) were generated once and committed.
- Install-to-home-screen and push work only over HTTPS (except `localhost`).
- Push keys/env: see the `api-reference` skill (Push and reminders).

## Phone via Tailscale

Phone and laptop in the same tailnet:
1. Tailscale admin → DNS: enable MagicDNS and HTTPS Certificates.
2. Run the app on `:8080`, then `tailscale serve --bg 8080`.
3. On the phone open `https://<host>.<tailnet>.ts.net` → Chrome menu → "Install app". Stop: `tailscale serve reset`.
