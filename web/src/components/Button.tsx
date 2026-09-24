import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cx } from '../lib/cx'
import styles from './Button.module.css'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'icon'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  /** Показать спиннер и заблокировать кнопку */
  loading?: boolean
  children?: ReactNode
}

export function Button({ variant = 'secondary', loading = false, className, disabled, type = 'button', children, ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(styles.btn, styles[variant], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <span className={styles.spinner} aria-hidden="true" />}
      {children}
    </button>
  )
}
