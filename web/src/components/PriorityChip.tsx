import { formatPriority } from '../lib/format'
import type { PriorityLevel } from '../lib/tasks'
import styles from './PriorityChip.module.css'
import { Icon } from './Icon'

const LEVEL_NAMES: Record<PriorityLevel, string> = { high: 'высокий', mid: 'средний', low: 'низкий' }

export function PriorityChip({ priority, level }: { priority: number; level: PriorityLevel }) {
  const text = formatPriority(priority)
  const spoken = text.startsWith('<') ? `меньше ${text.slice(1)}` : text
  return (
    <span className={`${styles.chip} ${styles[level]}`} role="img" aria-label={`Приоритет ${spoken}, ${LEVEL_NAMES[level]}`}>
      <Icon name="zap" className={styles.icon} />
      {text}
    </span>
  )
}
