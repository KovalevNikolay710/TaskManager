import { ApiError, request } from './client'
import type { PushKey, PushSubscribeRequest, PushSubscriptionInfo, PushTestRequest, PushTestResponse, PushUnsubscribeRequest } from './types'

/** Публичный VAPID-ключ сервера (applicationServerKey для pushManager.subscribe). */
export function fetchPushKey(): Promise<PushKey> {
  return request<PushKey>('/push/key')
}

/** Сохранить подписку устройства (upsert по endpoint: 201 — новая, 200 — уже была). */
export function subscribePush(input: PushSubscribeRequest): Promise<PushSubscriptionInfo> {
  return request<PushSubscriptionInfo>('/push/subscribe', { method: 'POST', body: input })
}

/** Удалить подписку на сервере. 404 — её там уже нет, это и нужно: не ошибка. */
export async function unsubscribePush(input: PushUnsubscribeRequest): Promise<void> {
  try {
    await request<unknown>('/push/subscribe', { method: 'DELETE', body: input })
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return
    throw error
  }
}

/** Тестовое уведомление. 404 — подписки нет на сервере, 410 — push-сервис её отклонил (удалена). */
export function sendTestPush(input: PushTestRequest): Promise<PushTestResponse> {
  return request<PushTestResponse>('/push/test', { method: 'POST', body: input })
}
