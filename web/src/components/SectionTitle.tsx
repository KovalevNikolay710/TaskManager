import type { ReactNode } from 'react'
import styles from './SectionTitle.module.css'

export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className={styles.sectionTitle}>
      <h2 className={styles.title}>{title}</h2>
      {action}
    </div>
  )
}
