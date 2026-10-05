---
name: warn-handler-layer
enabled: true
event: file
action: warn
conditions:
  - field: file_path
    operator: regex_match
    pattern: internal/api/handlers/.*\.go$
  - field: content
    operator: regex_match
    pattern: \b(repository|gorm)\.
---

**Обработчик обращается к БД в обход сервиса.**

В TaskManager слои строго: handler → service → repository. Обработчик (`internal/api/handlers/`) не импортирует
`repository` и `gorm` — он вызывает метод сервиса, а ошибки отдаёт через `respondError` / `respondBindingError`.
Перенеси работу с БД в репозиторий, логику — в сервис (см. навык `add-endpoint`).
