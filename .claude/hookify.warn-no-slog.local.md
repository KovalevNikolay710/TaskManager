---
name: warn-no-slog
enabled: true
event: file
action: warn
conditions:
  - field: file_path
    operator: regex_match
    pattern: \.go$
  - field: content
    operator: regex_match
    pattern: \blog\.(Print|Fatal|Panic)|fmt\.Print(ln|f)?\(
---

**Логирование не через `log/slog`.**

В проекте логи пишутся через `log/slog` со структурированными полями, сообщения — на русском:
`slog.Error("не удалось создать задачу", "userId", userID, "err", err)`.
Не используй `log.Print*` и `fmt.Print*` для логов.
