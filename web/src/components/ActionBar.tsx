import type { ReactNode } from 'react'
import { cx } from '../lib/cx'
import styles from './ActionBar.module.css'

/** ActionBar: липкая панель действий формы (мобильный — внизу экрана, десктоп — внизу колонки). */
export function ActionBar({ note, animated = false, children }: { note: string; animated?: boolean; children: ReactNode }) {
  return (
    <div className={cx(styles.bar, animated && styles.animated)}>
      <span className={styles.note}>{note}</span>
      {children}
    </div>
  )
}
