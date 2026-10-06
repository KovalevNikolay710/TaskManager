import type { ReactNode } from 'react'
import styles from './SectionTitle.module.css'

export function SectionTitle({ title, action, id }: { title: string; action?: ReactNode; id?: string }) {
  return (
    <div className={styles.sectionTitle}>
      <h2 className={styles.title} id={id}>
        {title}
      </h2>
      {action}
    </div>
  )
}
