import { useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { cx } from '../lib/cx'
import { GROUP_WEIGHT_MAX, GROUP_WEIGHT_MIN } from '../lib/groups'
import { clampWeight, weightClass } from '../lib/weight'
import styles from './WeightScale.module.css'

const STEPS = Array.from({ length: GROUP_WEIGHT_MAX }, (_, i) => i + 1)

interface WeightScaleProps {
  labelId: string
  hintId: string
  label: string
  value: number
  onChange: (value: number) => void
  /** Ступени, занятые другими группами: вес → названия групп */
  occupied: ReadonlyMap<number, readonly string[]>
  disabled?: boolean
}

/** «×4, на одной ступени с Английский» — aria-valuetext слайдера. */
function valueText(value: number, occupied: ReadonlyMap<number, readonly string[]>): string {
  const names = occupied.get(value)
  return names?.length ? `×${value}, на одной ступени с ${names.join(', ')}` : `×${value}`
}

/**
 * WeightScale — выбор веса группы ×1…×10 «мини-лесенкой»: 10 цветных столбиков в одной зоне нажатия.
 * Тап или перетаскивание выбирает столбик под курсором; ←/↓ −1, →/↑ +1, Home / End.
 */
export function WeightScale({ labelId, hintId, label, value, onChange, occupied, disabled = false }: WeightScaleProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const current = clampWeight(value)

  const set = (next: number) => {
    const clamped = Math.min(GROUP_WEIGHT_MAX, Math.max(GROUP_WEIGHT_MIN, next))
    if (clamped !== value) onChange(clamped)
  }

  const fromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return
    set(Math.floor(((event.clientX - rect.left) / rect.width) * GROUP_WEIGHT_MAX) + 1)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next: Record<string, number> = {
      ArrowLeft: current - 1,
      ArrowDown: current - 1,
      ArrowRight: current + 1,
      ArrowUp: current + 1,
      Home: GROUP_WEIGHT_MIN,
      End: GROUP_WEIGHT_MAX,
    }
    if (!(event.key in next)) return
    event.preventDefault()
    set(next[event.key])
  }

  const legend = [...occupied.entries()]
    .filter(([, names]) => names.length > 0)
    .sort(([a], [b]) => b - a)
    .map(([weight, names]) => `×${weight} ${names.join(', ')}`)

  return (
    <div className={cx(styles.scale, weightClass(current), disabled && styles.disabled)}>
      <div className={styles.head}>
        <span className={styles.label} id={labelId}>
          {label}
        </span>
        <output className={styles.value} aria-hidden="true">
          ×{value}
        </output>
      </div>
      <div
        ref={trackRef}
        className={styles.track}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-labelledby={labelId}
        aria-describedby={hintId}
        aria-valuemin={GROUP_WEIGHT_MIN}
        aria-valuemax={GROUP_WEIGHT_MAX}
        aria-valuenow={current}
        aria-valuetext={valueText(current, occupied)}
        aria-disabled={disabled || undefined}
        onKeyDown={disabled ? undefined : onKeyDown}
        onPointerDown={(event) => {
          if (disabled) return
          event.currentTarget.setPointerCapture(event.pointerId)
          fromPointer(event)
        }}
        onPointerMove={(event) => {
          if (!disabled && event.currentTarget.hasPointerCapture(event.pointerId)) fromPointer(event)
        }}
      >
        {STEPS.map((n) => (
          <span
            key={n}
            className={cx(styles.bar, weightClass(n), n <= current && styles.on, n === current && styles.current)}
            style={{ '--n': n } as CSSProperties}
            data-n={n}
          >
            {(occupied.get(n)?.length ?? 0) > 0 && <i className={styles.mark} />}
          </span>
        ))}
      </div>
      {legend.length > 0 && (
        <div className={styles.legend}>
          <i aria-hidden="true" />
          уже заняты: {legend.join(' · ')}
        </div>
      )}
    </div>
  )
}
