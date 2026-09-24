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

/** Свёрнутые группы экрана «Все задачи»; хранятся в localStorage массивом GroupId (0 — «Без группы»). */
export function useCollapsedGroups() {
  const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(readCollapsed)

  const toggleGroup = useCallback((groupId: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]))
      } catch {
        // Хранилище недоступно (приватный режим) — состояние живёт до перезагрузки
      }
      return next
    })
  }, [])

  return { collapsed, toggleGroup }
}
