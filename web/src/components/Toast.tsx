import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Button } from './Button'
import styles from './Toast.module.css'
import { ToastContext, type ToastOptions } from './toastContext'

const TOAST_DURATION_MS = 4000

interface ActiveToast extends ToastOptions {
  id: number
}

/** Сообщения об ошибках фоновых действий: снизу над навигацией, 4 секунды. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ActiveToast | null>(null)

  const showToast = useCallback((options: ToastOptions) => {
    setToast({ ...options, id: Date.now() })
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), TOAST_DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [toast])

  const value = useMemo(() => ({ showToast }), [showToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className={styles.region} role="status" aria-live="polite">
        {toast && (
          <div className={styles.toast} key={toast.id}>
            <span>{toast.message}</span>
            {toast.action && (
              <Button
                variant="ghost"
                className={styles.action}
                onClick={() => {
                  setToast(null)
                  toast.action?.onClick()
                }}
              >
                {toast.action.label}
              </Button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  )
}
