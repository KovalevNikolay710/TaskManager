import { useEffect, useRef, type ReactNode } from 'react'
import styles from './Alert.module.css'
import { Icon } from './Icon'

interface AlertProps {
  title: string
  children?: ReactNode
  /** Перевести фокус на сообщение при появлении (ошибка формы) */
  autoFocus?: boolean
}

/** Alert: ошибка внутри формы или Sheet. */
export function Alert({ title, children, autoFocus = true }: AlertProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!autoFocus) return
    ref.current?.focus()
    ref.current?.scrollIntoView({ block: 'nearest' })
  }, [autoFocus, title, children])

  return (
    <div className={styles.alert} role="alert" tabIndex={-1} ref={ref}>
      <Icon name="alert" size="sm" className={styles.icon} />
      <div className={styles.body}>
        <p className={styles.title}>{title}</p>
        {children && <p className={styles.text}>{children}</p>}
      </div>
    </div>
  )
}
