import { TaskStatus, type Task } from '../api/types'

export function isDone(task: Task): boolean {
  return task.Status === TaskStatus.Completed
}

/**
 * Единственное место сортировки задач: активные по Priority по убыванию,
 * затем выполненные — недавно отмеченные выше.
 */
export function sortTasks(tasks: readonly Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const doneA = isDone(a)
    const doneB = isDone(b)
    if (doneA !== doneB) return doneA ? 1 : -1
    if (!doneA) return b.Priority - a.Priority || a.TaskId - b.TaskId
    return Date.parse(b.UpdatedAt) - Date.parse(a.UpdatedAt) || a.TaskId - b.TaskId
  })
}

export type PriorityLevel = 'high' | 'mid' | 'low'

/** Максимальный Priority среди активных задач набора — база для уровней. */
export function maxActivePriority(tasks: readonly Task[]): number {
  return tasks.reduce((max, task) => (isDone(task) ? max : Math.max(max, task.Priority)), 0)
}

/** Уровень приоритета относительно максимума набора (пороги 0.6 и 0.25 из system.md). */
export function priorityLevel(priority: number, max: number): PriorityLevel {
  if (max <= 0) return 'low'
  if (priority >= 0.6 * max) return 'high'
  if (priority >= 0.25 * max) return 'mid'
  return 'low'
}

/** Нормализация для поиска: без регистра и с «ё» = «е» (длина строки не меняется). */
export function normalizeForSearch(text: string): string {
  return text.toLowerCase().replaceAll('ё', 'е')
}

export function matchesQuery(task: Task, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true
  return (
    normalizeForSearch(task.Name).includes(normalizedQuery) ||
    normalizeForSearch(task.Description).includes(normalizedQuery)
  )
}
