// Чистая логика push-уведомлений на этом устройстве (design/screens/profile.md, «Состояния push»).
// Всё, что зависит от браузера, передаётся параметрами — так это проверяется тестами.

import { ApiError } from '../api/client'
import type { PushSubscribeRequest } from '../api/types'

/** Устойчивое состояние push на устройстве (без промежуточных «запрос разрешения» и «ошибка»). */
export type PushStatus = 'unsupported' | 'denied' | 'off' | 'on'

/** Разрешение браузера: Notification.permission. */
export type PushPermission = 'default' | 'granted' | 'denied'

/** Что известно о браузере: поддержка push, разрешение и есть ли подписка. */
export interface PushEnvironment {
  supported: boolean
  permission: PushPermission
  hasSubscription: boolean
}

/**
 * Состояние push по (поддержка, разрешение, подписка):
 * нет API → «Не поддерживается»; denied → «Заблокированы»; granted и подписка → «Включены»;
 * иначе (default, или granted без подписки) → «Не включены».
 */
export function resolvePushStatus({ supported, permission, hasSubscription }: PushEnvironment): PushStatus {
  if (!supported) return 'unsupported'
  if (permission === 'denied') return 'denied'
  if (permission === 'granted' && hasSubscription) return 'on'
  return 'off'
}

/**
 * Поддержка push: 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window.
 * globals — window (или его срез в тестах).
 */
export function isPushSupported(globals: object): boolean {
  const nav: unknown = 'navigator' in globals ? globals.navigator : undefined
  return typeof nav === 'object' && nav !== null && 'serviceWorker' in nav && 'PushManager' in globals && 'Notification' in globals
}

const BASE64_RE = /^[A-Za-z0-9+/_-]+={0,2}$/

/**
 * base64url (без паддинга) → байты; так VAPID-ключ передаётся в applicationServerKey.
 * Пустая строка и не base64 — ошибка (а не пустой или искажённый ключ).
 */
export function base64UrlToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const trimmed = value.trim()
  const unpadded = trimmed.replace(/=+$/, '')
  if (!BASE64_RE.test(trimmed) || unpadded.length % 4 === 1) throw new Error('Неверная строка base64url')
  const base64 = unpadded.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * Подписка оформлена тем же ключом? Если браузер ключ не сообщает (null) — считаем, что нет:
 * переподписка безопаснее, чем подписка, на которую сервер не сможет отправить.
 */
export function sameApplicationServerKey(existing: ArrayBuffer | null | undefined, key: Uint8Array): boolean {
  if (!existing) return false
  const bytes = new Uint8Array(existing)
  if (bytes.length !== key.length) return false
  return bytes.every((byte, i) => byte === key[i])
}

/** Результат subscription.toJSON(): поля необязательны по типам браузера. */
export interface SubscriptionJson {
  endpoint?: string
  keys?: Record<string, string>
}

/** Тело POST /push/subscribe из subscription.toJSON(); null — у подписки нет endpoint или ключей. */
export function toSubscribeRequest(json: SubscriptionJson, userId: number, userAgent: string): PushSubscribeRequest | null {
  const endpoint = json.endpoint
  const p256dh = json.keys?.p256dh
  const auth = json.keys?.auth
  if (!endpoint || !p256dh || !auth) return null
  return { userId, endpoint, keys: { p256dh, auth }, userAgent }
}

/** Шаг включения push, на котором случилась ошибка; «Повторить» продолжает с него. */
export type PushEnableStep = 'key' | 'subscribe' | 'server'

export const PUSH_NETWORK_ERROR_TEXT = 'Сервер не ответил. Разрешение браузера сохранено — осталось повторить.'

/** Текст под «Не удалось включить уведомления» по шагу и ошибке. */
export function pushEnableErrorText(step: PushEnableStep, error: unknown): string {
  if (error instanceof ApiError) {
    return error.status === 0 ? PUSH_NETWORK_ERROR_TEXT : error.message
  }
  // ключ пришёл, но не разобрался (не base64url)
  if (step === 'key') return 'Сервер прислал неверный ключ уведомлений.'
  if (step === 'subscribe') {
    const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : ''
    if (name === 'NotAllowedError') return 'Браузер не разрешил подписку. Проверьте разрешение на уведомления для этого сайта.'
    if (name === 'ServiceWorkerTimeout') return 'Служебный скрипт приложения ещё не запущен. Обновите страницу и повторите.'
    return 'Браузер не смог подписаться на уведомления: push-сервис недоступен. Повторите чуть позже.'
  }
  return error instanceof Error && error.message ? error.message : 'Неизвестная ошибка'
}

/** Ответ на тестовое уведомление 404/410: подписка потеряна или устарела — её надо снять. */
export function isStaleSubscriptionError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 410)
}
