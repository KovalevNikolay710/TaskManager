---
name: frontend-conventions
description: Соглашения фронтенда TaskManager (Vite + React + TypeScript в web/) — структура папок, работа с API, стили на токенах дизайн-системы, сборка и встраивание в Go-бинарник. Используй при любой работе в web/.
---

# Фронтенд TaskManager

## Стек

- Vite + React + TypeScript (strict), без UI-китов и CSS-фреймворков — стили на токенах из `design/tokens.css`.
- Роутинг: `react-router-dom`. Серверное состояние: `@tanstack/react-query`. Больше зависимостей — только если без них заметно сложнее, с пояснением в ответе.

## Создание проекта (если `web/` ещё нет)

```bash
npm create vite@latest web -- --template react-ts
cd web && npm install && npm install react-router-dom @tanstack/react-query
```

Удали демо-содержимое шаблона (логотипы, счётчик, App.css).

## Структура

```
web/src/
  api/          client.ts (fetch-обёртка), types.ts (типы ответов API), tasks.ts, groups.ts, days.ts
  components/   переиспользуемые компоненты (по одному на файл, стили рядом: Component.module.css)
  pages/        экраны — по одному на макет из design/screens/
  hooks/        react-query хуки (useTasks, useCreateTask, ...)
  styles/       tokens.css (копия design/tokens.css), global.css
  App.tsx, main.tsx
```

- `web/src/styles/tokens.css` — копия `design/tokens.css`. При изменении токенов в `design/` обновляй копию.
- Стили — CSS Modules, значения только через `var(--...)`, без захардкоженных цветов и размеров.

## Работа с API

- Все запросы — через `api/client.ts`: базовый путь из `import.meta.env.VITE_API_URL` (по умолчанию пустая строка — тот же origin), JSON, ошибки из `{"error": "..."}` превращаются в `Error` с этим текстом.
- В dev-режиме Vite проксирует API на Go-сервер: в `vite.config.ts` `server.proxy` проксирует только `/api` на `http://localhost:8080`. Префикс `/api` добавляется один раз в `BASE_URL` в `api/client.ts` — в `tasks.ts`, `days.ts` и других пути пишутся без него (`/tasks/user/1`).
- Типы в `api/types.ts` повторяют **реальные** поля ответа Go-моделей (`TaskId`, `DeadLine`, `Priority`...), запросы — camelCase как в `*Request` DTO. Сверяйся с `internal/models/`.
- `userId` пока передаётся явно (авторизации нет): держи его в одном месте — `api/user.ts`, константа `CURRENT_USER_ID = 1`.
- Сортировка задач по `Priority` по убыванию — в одном хелпере, не в каждом компоненте.

## Встраивание в Go

Уже настроено — один бинарник отдаёт и API, и фронтенд:
- `npm run build` кладёт сборку в `web/dist` (плагин в `vite.config.ts` сохраняет `dist/.gitkeep`);
- `web/embed.go` встраивает `web/dist` через `//go:embed`, `internal/api/spa.go` отдаёт файлы и fallback на `index.html` для путей SPA; неизвестные `/api/...` — 404 JSON;
- всё API живёт под `/api`, поэтому маршруты SPA (`/day`, `/tasks/:id`, ...) с ним не пересекаются;
- Dockerfile собирает фронтенд отдельным stage на `node:lts-alpine`.

## Проверка

```bash
cd web && npm run build     # включает tsc — ошибок типов быть не должно
npm run lint                # если настроен
```
