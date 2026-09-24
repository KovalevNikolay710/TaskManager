import type { ReactNode } from 'react'
import styles from './SummaryStat.module.css'

interface SummaryStatProps {
  value: ReactNode
  label: string
  /** Вторая строка подписи, например «из 5 запрошенных» */
  note?: string
  valueLabel?: string
  title?: string
}

export function SummaryStat({ value, label, note, valueLabel, title }: SummaryStatProps) {
  return (
    <div className={styles.stat} title={title}>
      <span className={styles.value} aria-label={valueLabel}>
        {value}
      </span>
      <span className={styles.label}>{label}</span>
      {note && <span className={styles.label}>{note}</span>}
    </div>
  )
}

export function SummaryStats({ children }: { children: ReactNode }) {
  return <div className={styles.stats}>{children}</div>
}
