import type { ReactNode } from 'react'
import { cx } from '../lib/cx'
import { Icon, type IconName } from './Icon'
import styles from './Notice.module.css'

interface NoticeProps {
  icon: IconName
  /** Жирное начало: «Нет сети.» */
  title: string
  children: ReactNode
  className?: string
}

/**
 * Notice: нейтральная плашка о состоянии среды (не ошибка), например «Нет сети».
 * Сама не live-область: кладите её в постоянный контейнер role="status", чтобы появление объявлялось.
 */
export function Notice({ icon, title, children, className }: NoticeProps) {
  return (
    <div className={cx(styles.notice, className)}>
      <Icon name={icon} size="sm" className={styles.icon} />
      <p className={styles.text}>
        <b>{title}</b> {children}
      </p>
    </div>
  )
}
