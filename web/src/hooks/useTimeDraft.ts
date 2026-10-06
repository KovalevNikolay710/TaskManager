import { useCallback, useLayoutEffect, useRef, useState } from 'react'

/**
 * Черновик поля времени поверх сохранённого значения. Когда сохранённое меняется
 * (ответ сервера, откат после ошибки), черновик сбрасывается к нему.
 */
export function useTimeDraft(saved: string): [string, (draft: string) => void] {
  const [state, setState] = useState({ saved, draft: saved })
  if (state.saved !== saved) setState({ saved, draft: saved })
  const setDraft = useCallback((draft: string) => setState((s) => ({ ...s, draft })), [])
  return [state.saved === saved ? state.draft : saved, setDraft]
}

/**
 * Ref для <input>, который вызывает onChange по нативному событию `change` — когда выбор
 * в нативном пикере завершён (React onChange срабатывает на каждый `input`).
 * Подходит для полей, которые появляются и скрываются: подписка живёт вместе с элементом.
 */
export function useNativeChangeRef(onChange: (value: string) => void): (input: HTMLInputElement | null) => (() => void) | undefined {
  const handlerRef = useRef(onChange)
  useLayoutEffect(() => {
    handlerRef.current = onChange
  })
  return useCallback((input: HTMLInputElement | null) => {
    if (!input) return undefined
    const listener = () => handlerRef.current(input.value)
    input.addEventListener('change', listener)
    return () => input.removeEventListener('change', listener)
  }, [])
}
