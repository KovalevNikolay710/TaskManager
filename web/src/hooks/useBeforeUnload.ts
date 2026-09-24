import { useEffect } from 'react'

/** Предупреждение браузера при закрытии вкладки, пока в форме есть несохранённые данные. */
export function useBeforeUnload(active: boolean) {
  useEffect(() => {
    if (!active) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [active])
}
