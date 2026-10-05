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
- **Day** — план на день: дата, время на день (`TimeForTasks`), задачи плана (`day_tasks`) и выделенные им минуты (`Day.Slots`), суммарный приоритет.
- **User** — пока не реализован: `userId` передаётся в запросах явно. Авторизация — в планах.

## Структура

```
cmd/taskManager/main.go      точка входа, сборка зависимостей, gin на :8080, планировщик напоминаний, штатная остановка по SIGTERM
internal/models/             GORM-модели и DTO запросов (*CreateRequest, *UpdateRequest)
internal/repository/         доступ к БД; GenericRepository[T] + специфичные методы
internal/services/           бизнес-логика; GenericService[T] для GetByID/Delete
internal/api/handlers/       gin-обработчики
internal/api/routes.go       все маршруты API (под префиксом /api)
internal/api/spa.go          раздача встроенного фронтенда, fallback на index.html для путей SPA
internal/config/             загрузка config.yaml (пока не подключена в main)
web/                         фронтенд: Vite + React + TypeScript (экраны «Все задачи» и «День»)
web/embed.go                 go:embed собранного web/dist в бинарник (в git — только dist/.gitkeep)
web/src/sw.ts                service worker PWA (vite-plugin-pwa, injectManifest): precache оболочки, fallback на index.html, /api — только сеть
web/public/                  статика как есть: favicon, icons/ (SVG из design/icons + PNG 192/512/maskable/apple-touch/badge, сгенерированы один раз и закоммичены)
design/                      дизайн-система и макеты экранов (ведёт агент designer)
```

Слои строго: handler → service → repository. Handler не ходит в БД, repository не содержит бизнес-логики.

## API (текущее)

| Метод | Путь | Что делает |
|---|---|---|
| POST | `/api/tasks/` | создать задачу |
| GET | `/api/tasks/:id` | задача по id |
| POST | `/api/tasks/update/:id` | частичное обновление: `name`, `description`, `deadline`, `timeForExecution`, `percentOfCompleting` (0–100), `groupId` (0 — без группы), `status` (1 — вернуть в работу, 2 — выполнена) |
| DELETE | `/api/tasks/:id` | удалить задачу (вместе со связями в `day_tasks` и `group_tasks`) |
| POST | `/api/tasks/user/:user_id` | задачи пользователя, фильтр `{status, groupId, date}` в теле (необязателен) |
| POST | `/api/days/` | создать день и составить план: `{date, userId, timeForTasks}` (15–960 мин); время делится между активными задачами |
| GET | `/api/days/:id` | сохранённый план дня (чтение план не пересобирает) |
| POST | `/api/days/update/:id` | пересобрать план: `{timeForTasks}` (необязательно, 15–960); выполненные задачи сохраняют свои минуты |
| DELETE | `/api/days/:id` | удалить день |
| GET | `/api/days/user/:user_id` | дни пользователя |
| POST | `/api/groups/` | создать группу |
| GET | `/api/groups/:id` | группа по id |
| POST | `/api/groups/update/:id` | обновить группу: `name`, `description`, `groupPriority` (1–10); смена веса пересчитывает задачи группы |
| POST | `/api/groups/reorder` | атомарно сменить веса нескольких групп: `{userId, groups: [{groupId, groupPriority}]}`; пересчитывает задачи, отвечает всеми группами пользователя |
| POST | `/api/groups/add/:id` | добавить задачу в группу |
| DELETE | `/api/groups/:id` | удалить группу; её задачи переходят в «без группы» с пересчётом приоритета |
| GET | `/api/groups/tasks/:id` | задачи группы |
| GET | `/api/groups/user/:user_id` | группы пользователя |
| GET | `/api/push/key` | публичный VAPID-ключ: `{"PublicKey": "…"}` (base64url) |
| POST | `/api/push/subscribe` | подписка устройства (upsert по `endpoint`): `{userId, endpoint, keys: {p256dh, auth}, userAgent}`; 201 — новая, 200 — обновлена; ответ без `P256dh`/`Auth` |
| DELETE | `/api/push/subscribe` | удалить подписку устройства: `{userId, endpoint}`; 404 — нет такой |
| POST | `/api/push/test` | тестовое уведомление: `{userId, endpoint?}` (без `endpoint` — на все устройства) → `{"Sent": N}`; 404 — подписки нет, 410 — push-сервис её отклонил, подписка удалена |
| GET | `/api/notifications/settings/:user_id` | настройки напоминаний; строки ещё нет — 200 со значениями по умолчанию |
| POST | `/api/notifications/settings/:user_id` | частичное обновление (upsert): `morningEnabled`, `morningTime`, `eveningEnabled`, `eveningTime`, `deadlineEnabled`, `deadlineHoursBefore` (1–24), `quietEnabled`, `quietFrom`, `quietTo`, `timezone`; время — `ЧЧ:ММ` |

Особенности, о которых надо помнить:
- Запросы принимают camelCase (`userId`, `deadline`, ...), а **ответы отдают поля моделей как есть** (`TaskId`, `UserId`, `DeadLine`, `Priority`...) — у моделей нет json-тегов. Менять это можно только синхронно с фронтендом.
- Даты — RFC3339.
- Ошибки: `{"error": "..."}`, `error` всегда строка. Коды: 201 — создание, 400 — ошибка ввода или валидации, 404 — нет сущности, 409 — конфликт (имя группы занято), 410 — push-подписка устарела, 500 — прочее. Бизнес-ошибки объявлены в `internal/services/errors.go`, обработчики отвечают через `respondError` / `respondBindingError` (`internal/api/handlers/errors.go`).
- Пустые списки отдаются как 200 `[]` (не 404 и не `null`).
- `Task.GroupId = 0` означает «без группы».
- Длительности (`TimeForExecution`, `Day.TimeForTasks`) хранятся в минутах; фронтенд показывает их как `ч:мм`.
- `Day.PriorityOfTheDay` — сумма `Priority` невыполненных задач плана, считается при выдаче, в БД не хранится.
- `Day.TimeForTasks` — сколько минут пользователь готов отдать делам в этот день (0:15–16:00). Количество задач не задаётся: `amountOfTasks` в запросах нет, `Day.AmountOfTasks` — лишь число задач плана на момент сборки.
- `Day.Slots` — `[{DayId, TaskId, Minutes}]` из той же таблицы `day_tasks` (модель `DayTask`, подключена через `SetupJoinTable`; колонки `day_day_id`, `task_task_id`, `minutes`). Отдаётся во всех эндпоинтах дня. Минуты считает `AllocateDayTime` (`internal/services/day_plan.go`, алгоритм «Темп + остаток» из `design/screens/day.md`): слот ≥ 15 мин и кратен 5, остаток — свободное время (не хранится). План фиксирован между пересборками: отметка задачи минуты не меняет. `Minutes = 0` у всех слотов — план старой версии.
- Всё API — под префиксом `/api`; остальные GET-пути отдают фронтенд (SPA). Неизвестный `/api/...` — 404 JSON.
- Удаление — методом `DELETE`.
- Вес группы — 1–10; имя группы уникально у пользователя без учёта регистра и пробелов по краям.
- Дедлайн — не раньше чем через час. `NumberOfHoursUntilDL` (Tl) пересчитывается от текущего времени при каждом изменении задачи; у просроченной задачи Tl = 1.
- `Status = 2` тогда и только тогда, когда `PercentOfCompleting = 100`.
- Push-напоминания — `design/screens/profile.md`. VAPID-ключи: `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` из окружения (в БД не пишутся), иначе строка `vapid_keys` в БД, иначе сервер создаёт пару сам при старте. `VAPID_SUBJECT` — по умолчанию `mailto:admin@localhost`. Смена ключей ломает существующие подписки (push-сервис отвечает 403 — подписка удаляется). Приватный ключ не логируется.
- Планировщик (`ReminderServiceImpl.Run`, `internal/services/reminder_services.go`) раз в минуту проверяет утро, вечер и «Дедлайн скоро» для пользователей с подписками; правила и тексты — чистые функции в `internal/services/reminders.go` (время и пояс — параметрами). Повторы отсекает `notification_log` (уникальный индекс `UserId, Kind, TaskId, Key`; запись — до отправки). Push-сервис ответил 404/410/403 — подписка удаляется.
- Время в настройках напоминаний — местное по `NotificationSettings.Timezone` (IANA; пусто — пояс сервера). База часовых поясов встроена в бинарник (`import _ "time/tzdata"` в `main.go`): в образе alpine её нет.

## Команды

```bash
go build ./...                       # сборка бэкенда
go vet ./...
docker compose up -d db              # только PostgreSQL (localhost:5434, postgres/12345678, task_manager_db)
DB_HOST=localhost DB_PORT=5434 DB_USER=postgres DB_PASSWORD=12345678 DB_NAME=task_manager_db go run ./cmd/taskManager
docker compose up --build            # всё приложение: http://localhost:8080 (UI + API)
```

Фронтенд: `cd web && npm install && npm run dev` — Vite проксирует `/api` на `localhost:8080`.

Сборка в один бинарник: `cd web && npm run build`, затем `go build ./...` — `web/embed.go` встраивает `web/dist`.
Без собранного фронтенда Go собирается (в `web/dist` закоммичен `.gitkeep`), но сервер отдаёт только API.
Docker-образ собирается в три stage: `node:lts-alpine` (фронтенд) → `golang` (бинарник) → `alpine`.
Используйте `docker compose` (v2), а не `docker-compose` (v1).
Ветку из worktree (`.claude/worktrees/<name>`) запускайте как тот же проект: `docker compose -p taskmanager up --build` из каталога worktree.
Без `-p` проект называется по каталогу: имя `manager_db` (`container_name`) окажется занято, а БД была бы новой и пустой.

PWA: манифест (`manifest.webmanifest`) и service worker (`sw.js`) генерирует `npm run build` (vite-plugin-pwa), в `npm run dev` SW не регистрируется.
Установка на телефон и push работают только по HTTPS (исключение — `localhost`).

Открыть приложение с телефона через Tailscale (телефон и компьютер — в одном tailnet):
1. В админке Tailscale (DNS) включить MagicDNS и HTTPS Certificates.
2. Запустить приложение на `:8080` (`docker compose up --build` или бинарник), затем `tailscale serve --bg 8080`.
3. Открыть на телефоне `https://<host>.<tailnet>.ts.net` → меню Chrome → «Установить приложение». Отключить: `tailscale serve reset`.

## Как ведётся работа (агенты)

Проект разрабатывается агентно. Основная сессия — координатор: разбивает задачу, вызывает субагентов, проверяет результат и коммитит.

- **designer** (`.claude/agents/designer.md`) — дизайн-система и макеты. Пишет только в `design/`.
- **developer** (`.claude/agents/developer.md`) — код фронтенда (`web/`) и бэкенда (`internal/`, `cmd/`).

Передача работы — через файлы:
1. designer кладёт экран в `design/screens/<screen>.html` (статичный макет) и `design/screens/<screen>.md` (спецификация: данные, состояния, действия, нужные эндпоинты).
2. developer реализует экран по этим двум файлам и токенам из `design/tokens.css`.
3. Если макету нужен эндпоинт, которого нет — developer добавляет его по навыку `add-endpoint`.
4. Тесты и ревью — агентами плагина ECC (см. ниже), затем координатор проверяет сборку и сливает ветку.

### Конвейер задачи

**designer → developer → тесты (ECC) → ревью (ECC) → координатор (проверки, коммит, merge)**

Своих агентов для тестов и ревью нет — используются готовые из плагина ECC:

| Роль | ECC | Когда |
|---|---|---|
| тесты Go | агент `ecc:tdd-guide` + навык `ecc:golang-testing` (`/ecc:go-test`) | после developer, если менялись `internal/`, `cmd/` |
| тесты web | навык `ecc:react-testing` (`/ecc:react-test`), Vitest | если менялся `web/` |
| ревью Go | агент `ecc:go-reviewer` | дифф затрагивает `internal/`, `cmd/` |
| ревью web | агенты `ecc:react-reviewer` + `ecc:typescript-reviewer` | дифф затрагивает `web/` |
| ревью крупной фичи | `/ecc:review-pr` или `/ecc:orch-review` | по желанию, перед merge |
| проверки перед merge | навык `ecc:verification-loop`; при падении сборки — `/ecc:go-build`, `/ecc:react-build` | всегда |
| правила-хуки проекта | `/ecc:hookify` → `.claude/hookify.*.local.md` | при новом правиле |

Правила для агентов ECC:
- Как и наши агенты, не создают и не переключают ветки, не коммитят, не делают merge и push.
- Тестировщик пишет только тесты (`*_test.go`, `web/src/**/*.test.ts(x)`). Если тест нашёл баг — описывает его в отчёте, продакшн-код не чинит.
  Логику, зависящую от времени, тестировать с `now`, переданным параметром.
- Ревьюер смотрит дифф `git diff develop...HEAD` и сверяет его не только с идиомами языка, но и с разделами «Правила» и
  «Особенности» API этого файла (слои, camelCase-запросы / PascalCase-ответы, `respondError`, пустые списки `[]`, русские комментарии).
  Ответ делит на «блокирует» и «советы»; ветка не сливается, пока есть блокирующие замечания.

## Git: gitflow

Все агенты и координатор работают по gitflow.

| Ветка | Откуда | Куда вливается | Для чего |
|---|---|---|---|
| `main` | — | — | только релизы, каждый релиз — тег `vX.Y.Z` |
| `develop` | `main` | `release/*` | интеграционная ветка, всегда собирается |
| `feature/<name>` | `develop` | `develop` | новая функциональность, экраны, макеты (`feature/design-<screens>`) |
| `bugfix/<name>` | `develop` | `develop` | исправление ошибки, найденной в `develop` |
| `release/X.Y.Z` | `develop` | `main` и `develop` | подготовка релиза: только фиксы и версия |
| `hotfix/X.Y.Z` | `main` | `main` и `develop` | срочное исправление релиза |

- Одна задача — одна ветка. Имя в camelCase по смыслу: `feature/taskScreen`, `bugfix/dayPriority`. Прямые коммиты в `develop` и `main` запрещены.
- Ветку создаёт координатор перед запуском агента. Субагенты не создают и не переключают ветки, не коммитят, не делают merge и push — только меняют файлы и отчитываются.
- Агенты, работающие параллельно, запускаются в изолированных worktree, каждый — на своей ветке.
- Дизайн (`design/`) коммитится в отдельной `feature/design-*` ветке, а не вместе с кодом.
- Слияние в `develop` — `git merge --no-ff` после проверок (`go build ./... && go vet ./...`, `npm run build`); ветка после слияния удаляется.
- `push`, релизы (`release/*` → `main`) и `hotfix/*` — только с подтверждения пользователя.

## Правила

- Код и идентификаторы — на английском, комментарии, логи и сообщения об ошибках — на русском (как в существующем коде).
- Ошибки оборачиваются через `fmt.Errorf("...: %w", err)`.
- Логирование — `log/slog` со структурированными полями.
- Перед завершением задачи: `go build ./... && go vet ./...`, а для фронтенда `npm run build` в `web/`.
- Коммиты — небольшие, по одной логической задаче; сообщения на английском.
