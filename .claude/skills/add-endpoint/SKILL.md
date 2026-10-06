---
name: add-endpoint
description: Steps to add or change a TaskManager Go endpoint (gin + GORM) layer by layer — model → repository → service → handler → route. Use for any backend API change.
---

# Adding an endpoint

Go bottom-up and copy the style of the neighbouring code. Reference implementation — tasks: `internal/models/task.go`, `internal/repository/task_database.go`, `internal/services/task_services.go`, `internal/api/handlers/task_handlers.go`. Current endpoints and contract: `api-reference` skill.

## 1. Model — `internal/models/<entity>.go`

- GORM model: primary key `<Entity>Id int64 gorm:"primaryKey;autoIncrement"`, `UserId` with `gorm:"not null;index"`, `CreatedAt`/`UpdatedAt`.
- Request DTOs beside it: `<Entity>CreateRequest` (`binding:"required"` on mandatory fields), `<Entity>UpdateRequest`; json tags camelCase.
- Register a new model in `db.AutoMigrate(...)` in `internal/repository/database.go`.

## 2. Repository — `internal/repository/<entity>_database.go`

```go
type XRepositoryImpl struct {
	*GenericRepository[models.X]
}

func NewXRepository(db *gorm.DB) *XRepositoryImpl {
	return &XRepositoryImpl{GenericRepository: NewGenericRepository[models.X](db)}
}
```

- CRUD comes from `GenericRepository` (`Create`, `FindByID`, `Update`, `Delete`; `Create`/`Update` take relation names to `Preload`). Add a method only for a specific query.
- Not found → `nil, nil` (as `FindByID`); other errors → `fmt.Errorf("ошибка при ...: %w", err)`.
- Data access only — rules belong to the service.

## 3. Service — `internal/services/<entity>_services.go`

- Validation and business rules (e.g. recalc priority via `calculateTaskPriorty` whenever a formula field changes).
- `slog` logs with structured fields.

## 4. Handler — `internal/api/handlers/<entity>_handler(s).go`

- Parse params (`strconv.ParseInt(context.Param("id"), 10, 64)`), `ShouldBindJSON` into the DTO.
- Bind error → `respondBindingError`; service error → `respondError` (`internal/api/handlers/errors.go`) — it picks the status from the error kind.
- Business errors are declared in `internal/services/errors.go` via `newError(ErrKindNotFound | ErrKindInvalidInput | ErrKindConflict, "текст для пользователя")` — Russian, user-facing, no technical detail.
- Status codes: 201 created, 200 otherwise; deletion is `DELETE /:id`.

## 5. Route — `internal/api/routes.go`

Add to the right group; all groups hang off `apiRoutes` (`/api` prefix). A new entity gets its own group from `apiRoutes`; wire its repository and service in `cmd/taskManager/main.go` and pass them to `RegisterTaskRoutes`.

## 6. Check

```bash
go build ./... && go vet ./... && go test ./...
```

With the DB up (`ops` skill), smoke-test with curl:

```bash
curl -s -X POST localhost:8080/api/tasks/ -H 'Content-Type: application/json' \
  -d '{"userId":1,"name":"Проверка","deadline":"2030-01-01T10:00:00Z","timeForExecution":60,"percentOfCompleting":0}'
```

## 7. Docs

Update the endpoint table in the `api-reference` skill (`.claude/skills/api-reference/SKILL.md`); if the response shape changes, update `web/src/api/types.ts` too.
