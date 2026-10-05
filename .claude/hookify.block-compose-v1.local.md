---
name: block-compose-v1
enabled: true
event: bash
action: block
pattern: \bdocker-compose\s
---

**`docker-compose` (v1) в проекте не используется.**

Используй Compose v2: `docker compose up -d db`, `docker compose up --build`.
