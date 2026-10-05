/// <reference lib="webworker" />
// Service worker TaskManager. Собирается vite-plugin-pwa в режиме injectManifest в dist/sw.js;
// список файлов для precache плагин подставляет вместо self.__WB_MANIFEST при сборке.
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare let self: ServiceWorkerGlobalScope

// registerType: 'autoUpdate' — новая версия активируется сразу и забирает открытые вкладки,
// страница перезагружается сама (см. registerSW в main.tsx), без диалога «Обновить?».
void self.skipWaiting()
clientsClaim()

// Оболочка приложения: собранные ассеты, index.html и иконки. Старые кеши прошлых сборок удаляются.
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// Маршруты SPA (/day, /all-tasks?quick=1, /tasks/42 ...) открываются из кеша и без сети:
// на любой навигационный запрос отдаётся index.html, дальше маршрутизирует React Router.
// /api исключён: если адрес API открыли напрямую, ответ должен прийти с сервера.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/api(\/|$)/],
  }),
)

// Запросы /api/** не перехватываются ни одним маршрутом выше, поэтому идут только в сеть
// и не кешируются: данные (приоритеты зависят от текущего времени) всегда свежие.
// Не добавляй сюда runtime-кеширование /api — офлайн-режим для данных не предусмотрен.

// --- Уведомления ---
// Здесь будут обработчики событий 'push' (показ уведомления через self.registration.showNotification,
// icon: '/icons/icon-192.png', badge: '/icons/badge-96.png', lang: 'ru') и 'notificationclick'
// (фокус открытого окна или clients.openWindow). Тексты и правила — design/screens/profile.md.
