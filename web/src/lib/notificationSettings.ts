// Настройки напоминаний (design/rules/push-states.md, «Состояния настроек напоминаний»).

import type { NotificationSettings, NotificationSettingsUpdateRequest } from '../api/types'
import { plural } from './format'

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

/** Время «ЧЧ:ММ» (24 ч, с ведущим нулём): «08:00», «23:59». */
export function isValidTime(value: string): boolean {
  return TIME_RE.test(value)
}

/**
 * Значение <input type="time"> → «ЧЧ:ММ» или null (пусто или не время).
 * Секунды, если браузер их добавил («08:00:00»), отбрасываются.
 */
export function normalizeTime(value: string): string | null {
  const trimmed = value.trim()
  const short = /^\d\d:\d\d:\d\d(\.\d+)?$/.test(trimmed) ? trimmed.slice(0, 5) : trimmed
  return isValidTime(short) ? short : null
}

export interface QuietHoursHint {
  text: string
  error: boolean
}

export const QUIET_SAME_ERROR = 'Начало и конец не могут совпадать'
export const QUIET_NEUTRAL_HINT = 'Укажите начало и конец в формате ЧЧ:ММ'

/**
 * Подсказка под «С [..] до [..]»: «Через полночь: до 07:00 следующего дня», если начало позже конца,
 * «С 13:00 до 15:00 того же дня» — иначе; совпадение — ошибка. Строки «ЧЧ:ММ» сравниваются лексикографически.
 */
export function quietHoursHint(from: string, to: string): QuietHoursHint {
  // Неполное или неверное время сравнивать бессмысленно — нейтральная подсказка
  if (!isValidTime(from) || !isValidTime(to)) return { text: QUIET_NEUTRAL_HINT, error: false }
  if (from === to) return { text: QUIET_SAME_ERROR, error: true }
  if (from > to) return { text: `Через полночь: до ${to} следующего дня`, error: false }
  return { text: `С ${from} до ${to} того же дня`, error: false }
}

/** Варианты «Дедлайн скоро: за N ч». */
export const DEADLINE_HOURS_OPTIONS = [1, 3, 6, 12, 24] as const

/** Для скринридера: «за 1 час», «за 3 часа», «за 6 часов». */
export function deadlineHoursLabel(hours: number): string {
  return `за ${hours} ${plural(hours, ['час', 'часа', 'часов'])}`
}

/**
 * Нужно ли молча отправить часовой пояс браузера: на сервере пусто или другой пояс.
 * Если браузер пояс не сообщил — не отправляем.
 */
export function needsTimezoneSync(serverTimezone: string | null | undefined, browserTimezone: string | null | undefined): boolean {
  if (!browserTimezone) return false
  return serverTimezone !== browserTimezone
}

/** Часовой пояс браузера (IANA) или null. */
export function browserTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null
  } catch {
    return null
  }
}

const PATCH_FIELDS = {
  morningEnabled: 'MorningEnabled',
  morningTime: 'MorningTime',
  eveningEnabled: 'EveningEnabled',
  eveningTime: 'EveningTime',
  deadlineEnabled: 'DeadlineEnabled',
  deadlineHoursBefore: 'DeadlineHoursBefore',
  quietEnabled: 'QuietEnabled',
  quietFrom: 'QuietFrom',
  quietTo: 'QuietTo',
  timezone: 'Timezone',
} as const satisfies Record<keyof NotificationSettingsUpdateRequest, keyof NotificationSettings>

type PatchKey = keyof typeof PATCH_FIELDS

function patchKeys(patch: NotificationSettingsUpdateRequest): PatchKey[] {
  return (Object.keys(PATCH_FIELDS) as PatchKey[]).filter((key) => patch[key] !== undefined)
}

/** Оптимистичное применение изменения (camelCase запроса → PascalCase настроек). */
export function applySettingsPatch(settings: NotificationSettings, patch: NotificationSettingsUpdateRequest): NotificationSettings {
  const next: NotificationSettings = { ...settings }
  for (const key of patchKeys(patch)) {
    Object.assign(next, { [PATCH_FIELDS[key]]: patch[key] })
  }
  return next
}

/**
 * Откат одного изменения: прежние значения только тех полей, что были в patch.
 * Другие изменения, сделанные за время запроса, не затрагиваются.
 */
export function revertSettingsPatch(
  current: NotificationSettings,
  previous: NotificationSettings,
  patch: NotificationSettingsUpdateRequest,
): NotificationSettings {
  const next: NotificationSettings = { ...current }
  for (const key of patchKeys(patch)) {
    const field = PATCH_FIELDS[key]
    Object.assign(next, { [field]: previous[field] })
  }
  return next
}
