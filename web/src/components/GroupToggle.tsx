import type { Group } from '../api/types'
import { cx } from '../lib/cx'
import { weightClass } from '../lib/weight'
import formStyles from './Form.module.css'
import styles from './GroupToggle.module.css'
import { Icon } from './Icon'

interface GroupToggleProps {
  /** Выбранная группа; null — «Без группы» */
  group: Group | null
  loading: boolean
  expanded: boolean
  /** id ряда групп (aria-controls) */
  controls: string
  disabled?: boolean
  onToggle: () => void
}

/** GroupToggle: текущая группа в «Быстрой задаче»; раскрывает ряд групп. */
export function GroupToggle({ group, loading, expanded, controls, disabled = false, onToggle }: GroupToggleProps) {
  if (loading) return <span className={cx(formStyles.chip, formStyles.chipSkeleton, styles.skeleton)} aria-hidden="true" />

  const name = group?.Name ?? 'Без группы'
  return (
    <button
      type="button"
      className={cx(formStyles.chip, styles.toggle, group && weightClass(group.GroupPriority))}
      aria-expanded={expanded}
      aria-controls={controls}
      aria-label={group ? `Группа: ${name}, вес ${group.GroupPriority}. Сменить` : 'Группа: без группы. Сменить'}
      title={name}
      disabled={disabled}
      // Как у чипов: фокус остаётся в поле названия, клавиатура не закрывается
      onPointerDown={(e) => e.preventDefault()}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onToggle}
    >
      <span className={cx(formStyles.chipDot, !group && formStyles.chipDotBase)} aria-hidden="true" />
      <span className={styles.name}>{name}</span>
      {group && (
        <span className={cx(formStyles.chipWeight, styles.weight)} aria-hidden="true">
          ×{group.GroupPriority}
        </span>
      )}
      <Icon name="chevronDown" className={styles.chevron} />
    </button>
  )
}
