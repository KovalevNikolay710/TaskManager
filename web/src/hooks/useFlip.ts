import { useLayoutEffect, useRef } from 'react'

/**
 * Плавное перемещение элементов списка при смене порядка (FLIP).
 * Дочерние элементы списка помечаются data-flip-key; у списка должен быть position: relative,
 * чтобы offsetTop считался от него. Длительность — токен --duration-normal (0 при reduced motion).
 */
export function useFlip<T extends HTMLElement>() {
  const listRef = useRef<T>(null)
  const positions = useRef(new Map<string, number>())

  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return

    const styles = getComputedStyle(document.documentElement)
    const duration = parseFloat(styles.getPropertyValue('--duration-normal')) || 0
    const easing = styles.getPropertyValue('--easing-standard').trim() || 'ease'

    const next = new Map<string, number>()
    for (const item of Array.from(list.children) as HTMLElement[]) {
      const key = item.dataset.flipKey
      if (!key) continue
      const top = item.offsetTop
      next.set(key, top)
      const prevTop = positions.current.get(key)
      if (duration > 0 && prevTop !== undefined && prevTop !== top) {
        item.animate([{ transform: `translateY(${prevTop - top}px)` }, { transform: 'none' }], { duration, easing })
      }
    }
    positions.current = next
  })

  return listRef
}
