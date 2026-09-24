import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * «Назад» вложенного экрана: на предыдущую страницу приложения, если она есть в истории,
 * иначе — на родительский экран. react-router хранит номер записи истории в history.state.idx.
 */
export function useGoBack(fallback = '/all-tasks') {
  const navigate = useNavigate()
  return useCallback(() => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) navigate(-1)
    else navigate(fallback, { replace: true })
  }, [navigate, fallback])
}
