import { useId, type FormEvent, type ReactNode } from 'react'
import { cx } from '../lib/cx'
import { formatDuration, parseDuration } from '../lib/format'
import { PLAN_TIME_PRESETS, validatePlanTime } from '../lib/plan'
import styles from './PlanForm.module.css'

interface PlanFormProps {
  id?: string
  /** Текст поля «Время на день» как ввёл пользователь, «Ч:ММ» */
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  /** Подсказка под полем, пока нет ошибки */
  hint: string
  /** Минуты выполненных задач плана — нижняя граница при пересборке */
  doneMinutes?: number
  wide?: boolean
  /** Под полем: информационный Alert, кнопка отправки */
  children?: ReactNode
}

/**
 * PlanForm — единственный параметр плана дня: TimeInput «Время на день» и пресеты.
 * Количество задач не выбирается: сервер сам делит время между всеми подходящими задачами.
 */
export function PlanForm({ id, value, onChange, onSubmit, hint, doneMinutes = 0, wide = false, children }: PlanFormProps) {
  const uid = useId()
  const timeId = `${uid}-time`
  const hintId = `${uid}-time-hint`
  const { error } = validatePlanTime(value, doneMinutes)
  const currentMinutes = parseDuration(value)

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!error) onSubmit()
  }

  return (
    <form id={id} className={cx(styles.form, wide && styles.wide)} onSubmit={handleSubmit} noValidate>
      <div className={styles.timeField}>
        <label className={styles.label} htmlFor={timeId}>
          Время на день
        </label>
        <span className={cx(styles.timeInput, error && styles.timeInputError)}>
          <input
            id={timeId}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="0:00"
            value={value}
            aria-describedby={hintId}
            aria-invalid={Boolean(error)}
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => {
              const minutes = parseDuration(value)
              if (minutes !== null) onChange(formatDuration(minutes))
            }}
          />
          <span className={styles.unit}>ч:мм</span>
        </span>
        <div className={styles.chips} role="group" aria-label="Быстрый выбор">
          {PLAN_TIME_PRESETS.map((minutes) => (
            <button
              key={minutes}
              type="button"
              className={styles.chip}
              aria-pressed={currentMinutes === minutes}
              onClick={() => onChange(formatDuration(minutes))}
            >
              {formatDuration(minutes)}
            </button>
          ))}
        </div>
        <span className={cx(styles.hint, error && styles.hintError)} id={hintId}>
          {error ?? hint}
        </span>
      </div>
      {children}
    </form>
  )
}
