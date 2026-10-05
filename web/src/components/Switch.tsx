import { cx } from '../lib/cx'
import styles from './Switch.module.css'

interface SwitchProps {
  checked: boolean
  onChange: (next: boolean) => void
  /** id подписи (название настройки) */
  labelledBy: string
  /** id пояснения под названием */
  describedBy?: string
  disabled?: boolean
  /** Идёт асинхронное действие (запрос разрешения браузера): бегунок пульсирует, aria-busy */
  pending?: boolean
  id?: string
}

/** Switch: вкл./выкл. для настроек, которые применяются сразу, без кнопки «Сохранить». */
export function Switch({ checked, onChange, labelledBy, describedBy, disabled = false, pending = false, id }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      className={cx(styles.switch, pending && styles.pending)}
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-busy={pending || undefined}
      disabled={disabled}
      onClick={() => {
        if (!pending) onChange(!checked)
      }}
    >
      <span className={styles.track}>
        <span className={styles.thumb} />
      </span>
    </button>
  )
}
