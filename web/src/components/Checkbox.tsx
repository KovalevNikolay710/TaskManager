import { cx } from '../lib/cx'
import styles from './Checkbox.module.css'
import { Icon } from './Icon'

interface CheckboxProps {
  checked: boolean
  /** Запрос в процессе: показываем целевое состояние с пульсацией, нажатия игнорируем */
  pending?: boolean
  disabled?: boolean
  title?: string
  labelledBy: string
  onChange: () => void
}

/** Видимый квадрат 22px в зоне нажатия 44×44. */
export function Checkbox({ checked, pending = false, disabled = false, title, labelledBy, onChange }: CheckboxProps) {
  return (
    <label className={cx(styles.checkbox, pending && styles.pending)} title={title} onClick={(e) => e.stopPropagation()}>
      <input
        type="checkbox"
        checked={pending ? !checked : checked}
        disabled={disabled}
        aria-labelledby={labelledBy}
        aria-busy={pending || undefined}
        onChange={() => {
          if (!pending) onChange()
        }}
      />
      <span className={styles.box}>{!pending && <Icon name="check" size="xs" />}</span>
    </label>
  )
}
