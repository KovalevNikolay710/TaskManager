import { cx } from '../lib/cx'
import styles from './ProgressBar.module.css'

interface ProgressBarProps {
  label: string
  valueText: string
  value: number
  max: number
  /** Текст для скринридера, например «6 часов 45 минут из 7 часов» */
  ariaValueText: string
  /** Превышение 100% — danger-вариант и подсказка */
  overHint?: string
}

export function ProgressBar({ label, valueText, value, max, ariaValueText, overHint }: ProgressBarProps) {
  const over = Boolean(overHint)
  const fill = max > 0 ? Math.min(100, (value / max) * 100) : value > 0 ? 100 : 0
  return (
    <div className={cx(styles.progress, over && styles.over)}>
      <div className={styles.head}>
        <span className={styles.label}>{label}</span>
        <span className={styles.value}>{valueText}</span>
      </div>
      <div
        className={styles.track}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={ariaValueText}
      >
        <div className={styles.fill} style={{ width: `${fill}%` }} />
      </div>
      {overHint && <p className={styles.hint}>{overHint}</p>}
    </div>
  )
}
