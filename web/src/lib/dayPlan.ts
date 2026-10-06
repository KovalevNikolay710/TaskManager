import type { Day, Task } from '../api/types'
import { durationToWords, formatDuration } from './format'
import { isDone, sortTasks } from './tasks'

/** Остаток меньше 5 минут не показывается как «Свободно» (слоты кратны 5). */
export const FREE_MIN_MINUTES = 5

/** Строка плана дня: задача и выделенное ей на этот день время. */
export interface PlanItem {
  task: Task
  /** Минуты из Day.Slots; 0 — слота нет (старый план) */
  minutes: number
  done: boolean
}

export interface DayPlanSummary {
  /** Порядок списка и секторов: активные по Priority ↓, затем выполненные по минутам ↓ */
  items: PlanItem[]
  total: number
  activeMinutes: number
  doneMinutes: number
  doneCount: number
  freeMinutes: number
  /** Сумма Priority невыполненных задач плана */
  remainingPriority: number
  /** План составлен до распределения времени: слотов нет или у всех 0 минут */
  oldPlan: boolean
}

export function summarizeDay(day: Day): DayPlanSummary {
  const minutesById = new Map((day.Slots ?? []).map((slot) => [slot.TaskId, slot.Minutes]))
  const sorted = sortTasks(day.Tasks ?? [])
  const toItem = (task: Task): PlanItem => ({ task, minutes: minutesById.get(task.TaskId) ?? 0, done: isDone(task) })
  const active = sorted.filter((t) => !isDone(t)).map(toItem)
  const done = sorted
    .filter(isDone)
    .map(toItem)
    .sort((a, b) => b.minutes - a.minutes || a.task.TaskId - b.task.TaskId)
  const items = [...active, ...done]

  const sum = (list: PlanItem[]) => list.reduce((acc, item) => acc + item.minutes, 0)
  const activeMinutes = sum(active)
  const doneMinutes = sum(done)
  return {
    items,
    total: day.TimeForTasks,
    activeMinutes,
    doneMinutes,
    doneCount: done.length,
    freeMinutes: Math.max(0, day.TimeForTasks - activeMinutes - doneMinutes),
    remainingPriority: active.reduce((acc, item) => acc + item.task.Priority, 0),
    oldPlan: items.length > 0 && items.every((item) => item.minutes === 0),
  }
}

/**
 * Активные задачи, которых нет в плане: дедлайн позже начала дня, TaskId нет в Slots.
 * Нужны для подсказки «Ещё N задач не в плане».
 */
export function tasksOutsidePlan(day: Day, tasks: readonly Task[]): number {
  const planned = new Set((day.Slots ?? []).map((slot) => slot.TaskId))
  for (const task of day.Tasks ?? []) planned.add(task.TaskId)
  const dayStart = Date.parse(day.Date)
  return tasks.filter((t) => !isDone(t) && Date.parse(t.Deadline) > dayStart && !planned.has(t.TaskId)).length
}

/** Текстовая замена диаграммы: «План на 6:00: Отчёт 1 час 25 минут; …; свободно 2 часа 55 минут». */
export function planAriaLabel(summary: DayPlanSummary): string {
  const parts = summary.items.map((item) => `${item.task.Name} ${durationToWords(item.minutes)}${item.done ? ', выполнено' : ''}`)
  if (summary.freeMinutes >= FREE_MIN_MINUTES) parts.push(`свободно ${durationToWords(summary.freeMinutes)}`)
  return `План на ${formatDuration(summary.total)}: ${parts.join('; ')}`
}
