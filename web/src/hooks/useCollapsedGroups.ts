import { useCallback, useState } from 'react'

const STORAGE_KEY = 'tm.collapsedGroups'

function readCollapsed(): Set<number> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is number => typeof id === 'number') : [])
  } catch {
    return new Set()
  }
}

function writeCollapsed(collapsed: ReadonlySet<number>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...collapsed]))
  } catch {
    // Хранилище недоступно (приватный режим) — состояние живёт до перезагрузки
  }
}

/**
 * Свёрнутые группы экрана «Все задачи»; хранятся в localStorage массивом GroupId (0 — «Без группы»).
 * expandOnMount — группа, которую нужно раскрыть при открытии экрана (там новая задача).
 */
export function useCollapsedGroups(expandOnMount?: number) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(() => {
    const initial = readCollapsed()
    if (expandOnMount === undefined || !initial.has(expandOnMount)) return initial
    const next = new Set(initial)
    next.delete(expandOnMount)
    writeCollapsed(next)
    return next
  })

  const toggleGroup = useCallback((groupId: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      writeCollapsed(next)
      return next
    })
  }, [])

  return { collapsed, toggleGroup }
}
