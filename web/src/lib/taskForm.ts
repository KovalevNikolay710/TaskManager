import type { Task } from '../api/types'
import { combineDateTime, formatSpan, toDateKey, toTimeKey } from './dates'
import { formatDuration, parseDuration } from './format'
import { MIN_DEADLINE_MS } from './priority'

// Поля формы задачи (экраны «Новая задача» и «Задача») и их проверка — design/screens/new-task.md, «Валидация».

export const TASK_NAME_MAX = 200
export const TASK_DESCRIPTION_MAX = 2000
export const TASK_TIME_MIN = 5
export const TASK_TIME_MAX = 99 * 60 + 59
export const TASK_TIME_PRESETS = [30, 60, 120, 240]
/** Время дедлайна, если выбрана только дата */
export const DEFAULT_DEADLINE_TIME = '18:00'

export interface TaskFormValues {
  name: string
  description: string
  /** «YYYY-MM-DD» */
  date: string
  /** «HH:MM» */
  time: string
  /** Текст поля «Время на выполнение», «Ч:ММ» */
  duration: string
  percent: number
  groupId: number
}

export type TaskField = 'name' | 'deadline' | 'duration'
export type TaskFormErrors = Partial<Record<TaskField, string>>

export function taskToFormValues(task: Task): TaskFormValues {
  const deadline = new Date(task.DeadLine)
  return {
    name: task.Name,
    description: task.Description,
    date: toDateKey(deadline),
    time: toTimeKey(deadline),
    duration: formatDuration(task.TimeForExecution),
    percent: task.PercentOfCompleting,
    groupId: task.GroupId,
  }
}

export function validateTaskName(name: string): string | undefined {
  return name.trim() ? undefined : 'Введите название задачи'
}

/** Дедлайн: обе части заполнены и не раньше чем через час. */
export function validateDeadline(date: string, time: string, now = new Date()): string | undefined {
  const deadline = combineDateTime(date, time)
  if (!deadline) return 'Укажите дату и время дедлайна'
  const diff = deadline.getTime() - now.getTime()
  if (diff <= 0) return 'Дедлайн уже прошёл. Выберите время хотя бы на час позже текущего'
  if (diff < MIN_DEADLINE_MS) return DEADLINE_TOO_CLOSE
  return undefined
}

export const DEADLINE_TOO_CLOSE = 'Слишком близко: дедлайн должен быть хотя бы через час'

export function validateDuration(text: string): string | undefined {
  const minutes = parseDuration(text)
  if (minutes === null) return 'Введите время в формате ч:мм, например 1:30'
  if (minutes < TASK_TIME_MIN) return `Минимум ${formatDuration(TASK_TIME_MIN)}`
  if (minutes > TASK_TIME_MAX) return `Не больше ${formatDuration(TASK_TIME_MAX)}`
  return undefined
}

/** Предупреждение (не блокирует отправку): работы больше, чем времени до дедлайна. */
export function durationWarning(date: string, time: string, duration: string, now = new Date()): string | undefined {
  const deadline = combineDateTime(date, time)
  const minutes = parseDuration(duration)
  if (!deadline || minutes === null) return undefined
  const left = deadline.getTime() - now.getTime()
  if (left <= 0 || minutes * 60_000 <= left) return undefined
  return `До дедлайна ${formatSpan(left)}, а задача займёт ${formatDuration(minutes)} — может не хватить времени`
}

export type DeadlinePresetId = 'today' | 'tomorrow' | 'in3days' | 'inWeek'

export interface DeadlinePreset {
  /** Стабильный идентификатор: по нему выбирают чип, не сравнивая подписи */
  id: DeadlinePresetId
  label: string
  date: string
  time: string
}

/** Быстрые варианты дедлайна: «Сегодня, 21:00» (до 20:00), «Завтра, 18:00», «Через 3 дня», «Через неделю». */
export function deadlinePresets(now = new Date()): DeadlinePreset[] {
  const inDays = (days: number) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days)
    return toDateKey(date)
  }
  const presets: DeadlinePreset[] = []
  if (now.getHours() < 20) presets.push({ id: 'today', label: 'Сегодня, 21:00', date: inDays(0), time: '21:00' })
  presets.push(
    { id: 'tomorrow', label: 'Завтра, 18:00', date: inDays(1), time: DEFAULT_DEADLINE_TIME },
    { id: 'in3days', label: 'Через 3 дня', date: inDays(3), time: DEFAULT_DEADLINE_TIME },
    { id: 'inWeek', label: 'Через неделю', date: inDays(7), time: DEFAULT_DEADLINE_TIME },
  )
  return presets
}

/**
 * Срок, выбранный по умолчанию при открытии «Быстрой задачи» (design/screens/quick-add.md, «Срок по умолчанию»).
 * Контракт: возвращает один из presets (их даёт deadlinePresets(now)), никогда не «Другое…».
 */
export function defaultDeadlinePreset(now: Date, presets: DeadlinePreset[]): DeadlinePreset {
  // TODO(human): выбрать срок по умолчанию для быстрой задачи (см. design/screens/quick-add.md, «Срок по умолчанию»)
  void now // заглушка не смотрит на время; void — чтобы TS не ругался на неиспользуемый параметр
  return presets.find((preset) => preset.id === 'tomorrow') ?? presets[0]
}
