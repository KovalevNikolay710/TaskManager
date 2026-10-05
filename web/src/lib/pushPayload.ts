// Разбор push-сообщения в service worker (src/sw.ts). Без DOM и WebWorker API — проверяется тестами.
// Формат от сервера: {"title": "…", "body": "…", "url": "/day", "tag": "plan-morning"} (design/screens/profile.md).

export interface PushMessage {
  title: string
  body: string
  /** Путь внутри приложения (тот же origin), куда ведёт нажатие */
  url: string
  tag?: string
}

/** Показывается, если сообщение пустое или не разобралось: уведомление всё равно нужно показать. */
export const FALLBACK_PUSH_MESSAGE: PushMessage = {
  title: 'TaskManager',
  body: 'Есть напоминание — откройте приложение.',
  url: '/',
}

const MAX_TITLE = 120
const MAX_BODY = 500

/**
 * Безопасный путь для перехода из уведомления: только относительный путь того же origin
 * («/day», «/tasks/42?x=1»). Абсолютные адреса, «//host», «/\\host», javascript: и прочее → «/».
 */
export function safeAppPath(raw: unknown, origin: string): string {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/'
  try {
    const url = new URL(raw, origin)
    if (url.origin !== origin) return '/'
    return url.pathname + url.search + url.hash
  } catch {
    return '/'
  }
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

/**
 * Текст push-сообщения → что показать. Битый JSON, не объект или пустой заголовок —
 * общий текст FALLBACK_PUSH_MESSAGE (service worker не должен падать).
 */
export function parsePushPayload(raw: string | null | undefined, origin: string): PushMessage {
  if (!raw) return FALLBACK_PUSH_MESSAGE
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return FALLBACK_PUSH_MESSAGE
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return FALLBACK_PUSH_MESSAGE
  const record = data as Record<string, unknown>
  const title = text(record.title, MAX_TITLE)
  if (!title) return FALLBACK_PUSH_MESSAGE
  const tag = text(record.tag, MAX_TITLE)
  return {
    title,
    body: text(record.body, MAX_BODY),
    url: safeAppPath(record.url, origin),
    ...(tag ? { tag } : {}),
  }
}
