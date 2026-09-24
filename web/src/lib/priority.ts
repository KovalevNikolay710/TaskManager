import type { Group, Task } from '../api/types'
import { isDone } from './tasks'

// Прогноз приоритета на клиенте — повторяет calculateTaskPriorty и refreshTaskPriorty
// из internal/services/task_services.go: Pt = Pg × Te ÷ Tl × %in.

const HOUR = 3_600_000

/** Минимальный дедлайн новой или изменённой задачи — через час (бэкенд считает Tl в целых часах). */
export const MIN_DEADLINE_MS = HOUR

/** Tl: целые часы до дедлайна, как int(difference.Hours()) на бэкенде. */
export function hoursUntil(deadline: Date, now: Date): number {
  return Math.trunc((deadline.getTime() - now.getTime()) / HOUR)
}

export interface PriorityFactors {
  /** Pg — вес группы */
  groupWeight: number
  /** Te — минуты */
  minutes: number
  /** Tl — часы до дедлайна */
  hours: number
  /** Выполнено, % */
  percent: number
}

export function calculatePriority({ groupWeight, minutes, hours, percent }: PriorityFactors): number {
  if (hours <= 0) return 0
  return (groupWeight * minutes) / hours * ((100 - percent) / 100)
}

/** Вес группы задачи: GroupPriority группы, для «Без группы» (и несуществующей группы) — 1. */
export function groupWeight(groupId: number, groups: readonly Group[] | undefined): number {
  if (groupId === 0) return 1
  return groups?.find((g) => g.GroupId === groupId)?.GroupPriority ?? 1
}

/**
 * Место задачи с приоритетом priority среди активных задач (без задачи excludeId):
 * 1 + число активных с большим приоритетом; total — все активные вместе с ней.
 */
export function queuePlace(priority: number, tasks: readonly Task[], excludeId?: number): { place: number; total: number } {
  const others = tasks.filter((t) => !isDone(t) && t.TaskId !== excludeId)
  return { place: 1 + others.filter((t) => t.Priority > priority).length, total: others.length + 1 }
}

/** «0,6», «0,65», «1,0» — множитель %in. */
export function formatFactor(value: number): string {
  const rounded = Math.round(value * 100) / 100
  const text = Number.isInteger(rounded * 10) ? rounded.toFixed(1) : rounded.toFixed(2)
  return text.replace('.', ',')
}

export interface PriorityFactorRow {
  op: '' | '×' | '÷'
  name: string
  sub: string
  value: string
}

/** Строки «Из чего складывается» для PriorityCard. */
export function priorityFactorRows(args: {
  groupName: string
  groupWeight: number
  minutes: number
  hours: number
  hoursSub: string
  percent: number
}): PriorityFactorRow[] {
  const hh = Math.floor(args.minutes / 60)
  const mm = String(args.minutes % 60).padStart(2, '0')
  return [
    { op: '', name: 'Вес группы', sub: args.groupName, value: String(args.groupWeight) },
    { op: '×', name: 'Время на выполнение', sub: `${hh}:${mm}`, value: `${args.minutes} мин` },
    { op: '÷', name: 'Часов до дедлайна', sub: args.hoursSub, value: String(args.hours) },
    { op: '×', name: 'Осталось сделать', sub: `выполнено ${args.percent}%`, value: formatFactor((100 - args.percent) / 100) },
  ]
}

/** Название группы для объяснения приоритета: «Учёба» в кавычках или «без группы». */
export function groupLabel(groupId: number, groups: readonly Group[] | undefined): string {
  const group = groupId === 0 ? undefined : groups?.find((g) => g.GroupId === groupId)
  return group ? `«${group.Name}»` : 'без группы'
}
