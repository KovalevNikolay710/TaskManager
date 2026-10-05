---
name: block-push-main
enabled: true
event: bash
action: block
pattern: \bgit\s+push\b.*(\bmain\b|--tags|--all|--mirror)
---

**Push в `main` и тегов — только с подтверждения пользователя.**

По gitflow `main` — только релизы (`release/*`, `hotfix/*` → `main` + тег `vX.Y.Z`), и любой push делается лишь
после явного «да» от пользователя. Остановись и спроси пользователя, прежде чем пушить.
