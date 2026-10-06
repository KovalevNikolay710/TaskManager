/// <reference lib="webworker" />
// Service worker TaskManager. Собирается vite-plugin-pwa в режиме injectManifest в dist/sw.js;
// список файлов для precache плагин подставляет вместо self.__WB_MANIFEST при сборке.
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { parsePushPayload, safeAppPath } from './lib/pushPayload'

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
// Тексты и правила — design/rules/reminders.md.

// Сервер присылает JSON {title, body, url, tag}. Показываем всегда, даже если сообщение битое:
// браузер требует видимое уведомление на каждый push (userVisibleOnly), иначе может отозвать подписку.
self.addEventListener('push', (event) => {
  const message = parsePushPayload(readPushText(event.data), self.location.origin)
  event.waitUntil(
    self.registration.showNotification(message.title, {
      body: message.body,
      // одинаковый tag заменяет прежнее уведомление, а не копит их
      tag: message.tag,
      data: { url: message.url },
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      lang: 'ru',
    }),
  )
})

function readPushText(data: PushMessageData | null): string | null {
  if (!data) return null
  try {
    return data.text()
  } catch {
    return null
  }
}

// Нажатие: закрыть уведомление, открыть нужный экран в уже открытом окне приложения или в новом.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data: unknown = event.notification.data
  const raw = data && typeof data === 'object' && 'url' in data ? data.url : undefined
  event.waitUntil(openApp(safeAppPath(raw, self.location.origin)))
})

async function openApp(path: string): Promise<void> {
  const target = new URL(path, self.location.origin).href
  try {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const sameOrigin = windows.filter((client) => new URL(client.url).origin === self.location.origin)
    // Окно, которым управляет этот service worker, умеет navigate(); остальные — только focus()
    const client = sameOrigin.find((c) => c.focused) ?? sameOrigin[0]
    if (!client) {
      await self.clients.openWindow(target)
      return
    }
    const focused = await client.focus()
    if (focused.url !== target) await focused.navigate(target)
  } catch {
    // окно не под этим service worker (открыто до его установки), закрылось или не дало фокус — открываем новое
    await self.clients.openWindow(target)
  }
}
