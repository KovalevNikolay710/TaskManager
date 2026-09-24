---
name: add-endpoint
description: Как добавить или изменить эндпоинт в Go-бэкенде TaskManager (gin + GORM) по слоям model → repository → service → handler → route. Используй при любой доработке API.
---

# Добавление эндпоинта

Иди по слоям снизу вверх и повторяй стиль соседнего кода (эталон — задачи: `internal/models/task.go`, `internal/repository/task_database.go`, `internal/services/task_services.go`, `internal/api/handlers/task_handlers.go`).

## 1. Модель — `internal/models/<entity>.go`

- GORM-модель: первичный ключ `<Entity>Id int64 gorm:"primaryKey;autoIncrement"`, `UserId` с `gorm:"not null;index"`, `CreatedAt`/`UpdatedAt`.
- DTO запросов рядом: `<Entity>CreateRequest` (с `binding:"required"` на обязательных полях), `<Entity>UpdateRequest`. JSON-теги в camelCase.
- Новую модель добавь в `db.AutoMigrate(...)` в `internal/repository/database.go`.

## 2. Репозиторий — `internal/repository/<entity>_database.go`

```go
type XRepositoryImpl struct {
	*GenericRepository[models.X]
}

func NewXRepository(db *gorm.DB) *XRepositoryImpl {
	return &XRepositoryImpl{GenericRepository: NewGenericRepository[models.X](db)}
}
```

- CRUD уже есть в `GenericRepository` (`Create`, `FindByID`, `Update`, `Delete`; `Create`/`Update` принимают имена связей для `Preload`). Свой метод — только для специфичных запросов.
- «Не найдено» — возвращай `nil, nil` (как `FindByID`), остальные ошибки — `fmt.Errorf("ошибка при ...: %w", err)`.
- Никакой бизнес-логики.

## 3. Сервис — `internal/services/<entity>_services.go`

- Валидация и бизнес-правила (например, пересчёт приоритета через `calculateTaskPriorty` при любом изменении полей формулы).
- Логи через `slog` со структурированными полями.

## 4. Обработчик — `internal/api/handlers/<entity>_handler(s).go`

- Разбор параметров (`strconv.ParseInt(context.Param("id"), 10, 64)`), `ShouldBindJSON` в DTO.
- Коды ответа: 400 — неверный ввод, 404 — не найдено, 500 — ошибка сервиса, 201 — создано, 200 — остальное.
- Ошибки в формате `gin.H{"error": "..."}` (текст на русском).

## 5. Маршрут — `internal/api/routes.go`

Добавь в нужную группу. Если сущность новая — создай сервис/репозиторий в `cmd/taskManager/main.go` и передай в `RegisterTaskRoutes`.

## 6. Проверка

```bash
go build ./... && go vet ./...
```

Если поднята БД — проверь curl'ом:

```bash
curl -s -X POST localhost:8080/tasks/ -H 'Content-Type: application/json' \
  -d '{"userId":1,"name":"Проверка","deadline":"2030-01-01T10:00:00Z","timeForExecution":60,"percentOfCompleting":0}'
```

## 7. Документация

Обнови таблицу API в `CLAUDE.md` и, если меняется формат ответа, `web/src/api/types.ts`.
