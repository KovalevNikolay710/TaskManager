import { useEffect, useRef, type ReactNode } from 'react'
import { cx } from '../lib/cx'
import styles from './Alert.module.css'
import { Icon } from './Icon'

/**
 * error — ошибка (role="alert", забирает фокус);
 * info — информационное сообщение; warning — действие нужно сделать вне приложения.
 * info и warning — без role="alert" и без перехвата фокуса.
 */
export type AlertTone = 'error' | 'info' | 'warning'

interface AlertProps {
  title: string
  children?: ReactNode
  /** Перевести фокус на сообщение при появлении (ошибка формы); у info и warning не действует */
  autoFocus?: boolean
  tone?: AlertTone
  /** Список шагов под текстом (например, где включить уведомления) */
  steps?: ReactNode[]
  /** Действие под текстом (например, «Пересобрать», «Повторить») */
  action?: ReactNode
}

/** Alert: ошибка, предупреждение или информационное сообщение внутри формы, Sheet или экрана. */
export function Alert({ title, children, autoFocus = true, tone = 'error', steps, action }: AlertProps) {
  const ref = useRef<HTMLDivElement>(null)
  const isError = tone === 'error'

  useEffect(() => {
    if (!autoFocus || !isError) return
    ref.current?.focus()
    ref.current?.scrollIntoView({ block: 'nearest' })
  }, [autoFocus, isError, title, children])

  return (
    <div
      className={cx(styles.alert, tone === 'info' && styles.info, tone === 'warning' && styles.warning)}
      role={isError ? 'alert' : undefined}
      tabIndex={isError ? -1 : undefined}
      ref={ref}
    >
      <Icon name={tone === 'info' ? 'info' : 'alert'} size="sm" className={styles.icon} />
      <div className={styles.body}>
        <p className={styles.title}>{title}</p>
        {children && <p className={styles.text}>{children}</p>}
        {steps && steps.length > 0 && (
          <ul className={styles.steps}>
            {steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ul>
        )}
        {action && <div className={styles.action}>{action}</div>}
      </div>
    </div>
  )
}
