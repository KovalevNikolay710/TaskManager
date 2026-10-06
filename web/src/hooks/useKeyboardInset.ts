import { useEffect, useState } from 'react'

/**
 * Высота экранной клавиатуры, которую нужно оставить под нижним листом.
 * В Chrome на Android с interactive-widget=resizes-content (web/index.html) клавиатура и так уменьшает
 * окно — тогда разница 0. В остальных браузерах окно не меняется, и лист поднимаем на
 * innerHeight − visualViewport.height.
 */
export function useKeyboardInset(enabled: boolean): number {
  const [inset, setInset] = useState(0)

  useEffect(() => {
    const viewport = window.visualViewport
    if (!enabled || !viewport) return
    const update = () => {
      // При увеличении щипком visualViewport тоже меньше окна, но клавиатура тут ни при чём
      const zoomed = viewport.scale > 1.01
      setInset(zoomed ? 0 : Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop)))
    }
    update()
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
    }
  }, [enabled])

  return inset
}
