import { formatDuration, parseDuration } from './format'

export const PLAN_TIME_MIN = 15
export const PLAN_TIME_MAX = 16 * 60
export const PLAN_TIME_PRESETS = [120, 240, 360, 480]
/** Время по умолчанию для первого плана (потом — последнее использованное TimeForTasks) */
export const PLAN_DEFAULT_MINUTES = 360

/**
 * Проверка поля «Время на день» (TimeInput): минуты или текст ошибки.
 * doneMinutes — минуты выполненных задач плана: при пересборке время дня не может быть меньше.
 */
export function validatePlanTime(text: string, doneMinutes = 0): { minutes: number; error: null } | { minutes: null; error: string } {
  const minutes = parseDuration(text)
  if (minutes === null) return { minutes: null, error: 'Введите время в формате ч:мм, например 2:30' }
  if (minutes > PLAN_TIME_MAX) return { minutes: null, error: `Не больше ${formatDuration(PLAN_TIME_MAX)}` }
  if (doneMinutes > PLAN_TIME_MIN && minutes < doneMinutes) {
    return { minutes: null, error: `Меньше, чем уже выполнено (${formatDuration(doneMinutes)})` }
  }
  if (minutes < PLAN_TIME_MIN) return { minutes: null, error: `Не меньше ${formatDuration(PLAN_TIME_MIN)}` }
  return { minutes, error: null }
}
