import { request } from './client'
import type { NotificationSettings, NotificationSettingsUpdateRequest } from './types'

/** Настройки напоминаний; если их ещё нет — сервер отдаёт значения по умолчанию. */
export function fetchNotificationSettings(userId: number): Promise<NotificationSettings> {
  return request<NotificationSettings>(`/notifications/settings/${userId}`)
}

/** Частичное обновление (upsert); ответ — полные настройки. */
export function updateNotificationSettings(userId: number, patch: NotificationSettingsUpdateRequest): Promise<NotificationSettings> {
  return request<NotificationSettings>(`/notifications/settings/${userId}`, { method: 'POST', body: patch })
}
