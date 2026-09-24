// Настройки интерфейса в localStorage. Хранилище может быть недоступно (приватный режим) —
// тогда значения живут до перезагрузки, ошибки не пробрасываются.

export function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Хранилище недоступно — не страшно
  }
}

const LAST_GROUP_KEY = 'tm.lastGroupId'

/** Группа, в которую последний раз создавали задачу (0 — без группы). */
export function readLastGroupId(): number {
  const value = Number(readStorage(LAST_GROUP_KEY))
  return Number.isInteger(value) && value > 0 ? value : 0
}

export function writeLastGroupId(groupId: number): void {
  writeStorage(LAST_GROUP_KEY, String(groupId))
}
