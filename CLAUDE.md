# TaskManager — менеджер персональных задач

Личное приложение для управления задачами с автоматической сортировкой по приоритету.
Цель — простое приложение, которое хостится дёшево (на ноутбуке автора или маленьком VPS):
один Go-бинарник/контейнер отдаёт и API, и собранный фронтенд. Сначала — веб-версия в браузере.

## Главная идея: формула приоритета

```
Pt = Pg * Te / Tl * %in
```

- `Pt` — приоритет задачи (`Task.Priority`)
- `Pg` — приоритет группы задачи (`Task.GroupPriorty`, берётся из `Group.GroupPriority`)
- `Te` — время на выполнение, минуты (`Task.TimeForExecution`)
- `Tl` — оставшееся время до дедлайна, часы (`Task.NumberOfHoursUntilDL`)
- `%in` — доля незавершённости: `(100 - PercentOfCompleting) / 100`

Реализация: `calculateTaskPriorty` в `internal/services/task_services.go`.
Списки задач в интерфейсе всегда показываются отсортированными по `Priority` (по убыванию).

## Сущности

- **Task** — задача: имя, описание, дедлайн, время на выполнение, % выполнения, статус (1 — активна, 2 — выполнена), группа.
- **Group** — группа задач со своим приоритетом (больше — важнее). Задачи связаны через `group_tasks`.
- **Day** — план на день: дата, время на задачи, количество задач, набор задач (`day_tasks`), суммарный приоритет.
- **User** — пока не реализован: `userId` передаётся в запросах явно. Авторизация — в планах.

## Структура

```
cmd/taskManager/main.go      точка входа, сборка зависимостей, gin на :8080
internal/models/             GORM-модели и DTO запросов (*CreateRequest, *UpdateRequest)
internal/repository/         доступ к БД; GenericRepository[T] + специфичные методы
internal/services/           бизнес-логика; GenericService[T] для GetByID/Delete
internal/api/handlers/       gin-обработчики
internal/api/routes.go       все маршруты
internal/config/             загрузка config.yaml (пока не подключена в main)
web/                         фронтенд: Vite + React + TypeScript (создаётся)
design/                      дизайн-система и макеты экранов (ведёт агент designer)
```

Слои строго: handler → service → repository. Handler не ходит в БД, repository не содержит бизнес-логики.

## API (текущее)

| Метод | Путь | Что делает |
|---|---|---|
| POST | `/tasks/` | создать задачу |
| GET | `/tasks/:id` | задача по id |
| POST | `/tasks/update/:id` | обновить задачу |
| GET | `/tasks/delete/:id` | удалить задачу |
| POST | `/tasks/user/:user_id` | задачи пользователя, фильтр `{status, groupId, date}` в теле (необязателен) |
| POST | `/days/` | создать день |
| GET | `/days/:id` | день по id |
| POST | `/days/update/:id` | обновить день |
| GET | `/days/delete/:id` | удалить день |
| GET | `/days/user/:user_id` | дни пользователя |
| POST | `/groups/` | создать группу |
| GET | `/groups/:id` | группа по id |
| POST | `/groups/update/:id` | обновить группу |
| POST | `/groups/add/:id` | добавить задачу в группу |
| GET | `/groups/delete/:id` | удалить группу |
| GET | `/groups/tasks/:id` | задачи группы |
| GET | `/groups/user/:user_id` | группы пользователя |

Особенности, о которых надо помнить:
- Запросы принимают camelCase (`userId`, `deadline`, ...), а **ответы отдают поля моделей как есть** (`TaskId`, `UserId`, `DeadLine`, `Priority`...) — у моделей нет json-тегов. Менять это можно только синхронно с фронтендом.
- Даты — RFC3339.
- Ошибки: `{"error": "..."}`.
- Удаление через GET — временно; при подключении фронтенда планируется перевести API под префикс `/api` и удаление на `DELETE`.

## Команды

```bash
go build ./...                       # сборка бэкенда
go vet ./...
docker-compose up -d db              # только PostgreSQL (localhost:5432, postgres/12345678, task_manager_db)
DB_HOST=localhost DB_PORT=5432 DB_USER=postgres DB_PASSWORD=12345678 DB_NAME=task_manager_db go run ./cmd/taskManager
docker-compose up --build            # всё приложение
```

Фронтенд (после создания `web/`): `cd web && npm install && npm run dev` — Vite проксирует запросы к API на `localhost:8080`.

## Как ведётся работа (агенты)

Проект разрабатывается агентно. Основная сессия — координатор: разбивает задачу, вызывает субагентов, проверяет результат и коммитит.

- **designer** (`.claude/agents/designer.md`) — дизайн-система и макеты. Пишет только в `design/`.
- **developer** (`.claude/agents/developer.md`) — код фронтенда (`web/`) и бэкенда (`internal/`, `cmd/`).

Передача работы — через файлы:
1. designer кладёт экран в `design/screens/<screen>.html` (статичный макет) и `design/screens/<screen>.md` (спецификация: данные, состояния, действия, нужные эндпоинты).
2. developer реализует экран по этим двум файлам и токенам из `design/tokens.css`.
3. Если макету нужен эндпоинт, которого нет — developer добавляет его по навыку `add-endpoint`.

## Правила

- Код и идентификаторы — на английском, комментарии, логи и сообщения об ошибках — на русском (как в существующем коде).
- Ошибки оборачиваются через `fmt.Errorf("...: %w", err)`.
- Логирование — `log/slog` со структурированными полями.
- Перед завершением задачи: `go build ./... && go vet ./...`, а для фронтенда `npm run build` в `web/`.
- Коммиты — небольшие, по одной логической задаче; сообщения на английском.
