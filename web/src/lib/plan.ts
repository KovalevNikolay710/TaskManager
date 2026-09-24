import { formatDuration, parseDuration } from './format'

export const PLAN_AMOUNT_MIN = 1
export const PLAN_AMOUNT_MAX = 20
export const PLAN_TIME_MIN = 15
export const PLAN_TIME_MAX = 16 * 60
export const PLAN_TIME_PRESETS = [120, 240, 360, 480]
export const PLAN_DEFAULTS = { amount: 5, minutes: 240 }

/** Проверка поля «Сколько времени» плана дня (TimeInput): минуты или текст ошибки. */
export function validatePlanTime(text: string): { minutes: number; error: null } | { minutes: null; error: string } {
  const minutes = parseDuration(text)
  if (minutes === null) return { minutes: null, error: 'Введите время в формате ч:мм, например 2:30' }
  if (minutes > PLAN_TIME_MAX) return { minutes: null, error: `Не больше ${formatDuration(PLAN_TIME_MAX)}` }
  if (minutes < PLAN_TIME_MIN) return { minutes: null, error: `Не меньше ${formatDuration(PLAN_TIME_MIN)}` }
  return { minutes, error: null }
}
