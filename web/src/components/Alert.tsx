import { useEffect, useRef, type ReactNode } from 'react'
import { cx } from '../lib/cx'
import styles from './Alert.module.css'
import { Icon } from './Icon'

interface AlertProps {
  title: string
  children?: ReactNode
  /** Перевести фокус на сообщение при появлении (ошибка формы); у info не действует */
  autoFocus?: boolean
  /** info — информационный вариант: без role="alert" и без перехвата фокуса */
  tone?: 'error' | 'info'
  /** Действие справа от текста (например, «Пересобрать») */
  action?: ReactNode
}

/** Alert: ошибка или информационное сообщение внутри формы, Sheet или экрана. */
export function Alert({ title, children, autoFocus = true, tone = 'error', action }: AlertProps) {
  const ref = useRef<HTMLDivElement>(null)
  const info = tone === 'info'

  useEffect(() => {
    if (!autoFocus || info) return
    ref.current?.focus()
    ref.current?.scrollIntoView({ block: 'nearest' })
  }, [autoFocus, info, title, children])

  return (
    <div className={cx(styles.alert, info && styles.info)} role={info ? undefined : 'alert'} tabIndex={info ? undefined : -1} ref={ref}>
      <Icon name={info ? 'info' : 'alert'} size="sm" className={styles.icon} />
      <div className={styles.body}>
        <p className={styles.title}>{title}</p>
        {children && <p className={styles.text}>{children}</p>}
        {action && <div className={styles.action}>{action}</div>}
      </div>
    </div>
  )
}
