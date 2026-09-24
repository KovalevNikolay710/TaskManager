import type { Group } from '../api/types'
import { normalizeForSearch } from './tasks'

export const GROUP_WEIGHT_MIN = 1
export const GROUP_WEIGHT_MAX = 10
export const GROUP_NAME_MAX = 60
export const NO_GROUP_ID = 0

/** Порядок групп везде одинаковый: GroupPriority ↓, затем по имени. */
export function sortGroups(groups: readonly Group[]): Group[] {
  return [...groups].sort((a, b) => b.GroupPriority - a.GroupPriority || a.Name.localeCompare(b.Name, 'ru'))
}

/** Группа с таким же названием (без учёта регистра, пробелов по краям и «ё/е»), кроме excludeId. */
export function findSameName(name: string, groups: readonly Group[], excludeId?: number): Group | undefined {
  const normalized = normalizeForSearch(name.trim())
  return groups.find((g) => g.GroupId !== excludeId && normalizeForSearch(g.Name.trim()) === normalized)
}

/** Проверка названия группы: текст ошибки или null. */
export function validateGroupName(name: string, groups: readonly Group[], excludeId?: number): string | null {
  const trimmed = name.trim()
  if (!trimmed) return 'Введите название группы'
  if (trimmed.length > GROUP_NAME_MAX) return `Не длиннее ${GROUP_NAME_MAX} символов`
  const same = findSameName(trimmed, groups, excludeId)
  return same ? `Группа «${same.Name}» уже есть` : null
}
