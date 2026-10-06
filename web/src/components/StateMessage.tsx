import type { ReactNode } from 'react'
import { cx } from '../lib/cx'
import { Icon, type IconName } from './Icon'
import styles from './StateMessage.module.css'

interface StateMessageProps {
  icon: IconName
  title: string
  text?: ReactNode
  /** Технические детали (текст ошибки API) — мелко, моноширинным */
  detail?: string
  tone?: 'default' | 'error'
  /** Уменьшенный верхний отступ, когда над сообщением есть контент */
  compact?: boolean
  children?: ReactNode
}

/** EmptyState / ErrorState из system.md. */
export function StateMessage({ icon, title, text, detail, tone = 'default', compact = false, children }: StateMessageProps) {
  return (
    <div className={cx(styles.state, tone === 'error' && styles.error, compact && styles.compact)} role={tone === 'error' ? 'alert' : undefined}>
      <div className={styles.icon}>
        <Icon name={icon} className={styles.iconSvg} />
      </div>
      <h2 className={styles.title}>{title}</h2>
      {text && <p className={styles.text}>{text}</p>}
      {detail && <p className={styles.detail}>{detail}</p>}
      {children}
    </div>
  )
}
