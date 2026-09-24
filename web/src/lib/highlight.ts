// Задача, которую нужно подсветить на «Все задачи» после создания.
// Экран «Новая задача» уходит назад через history.back(), поэтому передать состояние
// через навигацию нельзя — храним его в памяти до первого показа «Все задачи».

export interface TaskHighlight {
  taskId: number
  /** Группа задачи — её секцию нужно раскрыть, если она свёрнута */
  groupId: number
}

let pending: TaskHighlight | null = null

export function requestTaskHighlight(highlight: TaskHighlight): void {
  pending = highlight
}

export function peekTaskHighlight(): TaskHighlight | null {
  return pending
}

export function clearTaskHighlight(): void {
  pending = null
}
