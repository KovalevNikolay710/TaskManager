import { GROUP_WEIGHT_MAX, GROUP_WEIGHT_MIN } from './groups'

// Правило переноса по лесенке групп — design/screens/groups.md, «Перенос: правило вставки между ступенями».

/** Группа на лесенке: вес уже ограничен шкалой 1–10. */
export interface LadderItem {
  id: number
  weight: number
}

export interface WeightShift {
  id: number
  from: number
  to: number
}

export interface InsertPlan {
  /** Ступень, на которую встанет перемещаемая группа */
  target: number
  /** Сдвинутые цепочкой группы (без перемещаемой) */
  shifts: WeightShift[]
}

/** Занятые ступени без перемещаемой группы; ×1 занята всегда — там «Без группы». */
export function occupiedSteps(items: readonly LadderItem[], movingId: number | null): Set<number> {
  const steps = new Set<number>([GROUP_WEIGHT_MIN])
  for (const item of items) if (item.id !== movingId) steps.add(item.weight)
  return steps
}

/** Промежуток между ступенями k и k+1 — цель, только если обе заняты другими группами. */
export function hasGap(items: readonly LadderItem[], movingId: number, k: number): boolean {
  const steps = occupiedSteps(items, movingId)
  return steps.has(k) && steps.has(k + 1)
}

/**
 * Вставка между ступенями k и k+1: группа встаёт на k+1, группы с k+1 поднимаются цепочкой
 * до первой свободной ступени; если вверх упираемся в ×10 — группа встаёт на k, а группы
 * опускаются цепочкой (не ниже ×2: ×1 занята «Без группы»). null — свободной ступени нет.
 */
export function insertPlan(items: readonly LadderItem[], movingId: number, k: number): InsertPlan | null {
  const rest = items.filter((item) => item.id !== movingId)
  const steps = occupiedSteps(items, movingId)

  let free = k + 1
  while (free <= GROUP_WEIGHT_MAX && steps.has(free)) free++
  if (free <= GROUP_WEIGHT_MAX) {
    return {
      target: k + 1,
      shifts: rest.filter((g) => g.weight >= k + 1 && g.weight < free).map((g) => ({ id: g.id, from: g.weight, to: g.weight + 1 })),
    }
  }

  free = k
  while (free > GROUP_WEIGHT_MIN && steps.has(free)) free--
  if (free > GROUP_WEIGHT_MIN) {
    return {
      target: k,
      shifts: rest.filter((g) => g.weight <= k && g.weight > free).map((g) => ({ id: g.id, from: g.weight, to: g.weight - 1 })),
    }
  }
  return null
}

/** Изменения весов после переноса: перемещаемая группа и сдвинутые (только те, у кого вес меняется). */
export function planChanges(movingId: number, from: number, plan: InsertPlan): WeightShift[] {
  const changes = plan.target === from ? [] : [{ id: movingId, from, to: plan.target }]
  return [...changes, ...plan.shifts]
}
