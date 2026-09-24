import { createContext } from 'react'

export interface ToastOptions {
  message: string
  action?: { label: string; onClick: () => void }
}

export interface ToastContextValue {
  showToast: (options: ToastOptions) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)
