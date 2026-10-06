import type { ReactNode } from 'react'
import { Button } from './Button'
import styles from './DateSwitcher.module.css'
import { Icon } from './Icon'

interface Arrow {
  label: string
  disabled: boolean
  onClick: () => void
}

interface DateSwitcherProps {
  title: string
  sub?: string
  badge?: ReactNode
  prev: Arrow
  next: Arrow
}

export function DateSwitcher({ title, sub, badge, prev, next }: DateSwitcherProps) {
  return (
    <div className={styles.switcher}>
      <Button variant="icon" aria-label={prev.label} disabled={prev.disabled} onClick={prev.onClick}>
        <Icon name="chevronLeft" />
      </Button>
      <div className={styles.date} aria-live="polite">
        <span className={styles.main}>{title}</span>
        {sub && <span className={styles.sub}>{sub}</span>}
        {badge && <span className={styles.badge}>{badge}</span>}
      </div>
      <Button variant="icon" aria-label={next.label} disabled={next.disabled} onClick={next.onClick}>
        <Icon name="chevronRight" />
      </Button>
    </div>
  )
}
