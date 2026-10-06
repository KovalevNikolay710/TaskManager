import { createContext } from 'react'

export interface ToastOptions {
  message: string
  action?: { label: string; onClick: () => void }
  /** Сколько показывать, мс (по умолчанию 4 с) */
  duration?: number
}

export interface ToastContextValue {
  showToast: (options: ToastOptions) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)
