import { useId, type FormEvent, type ReactNode } from 'react'
import { cx } from '../lib/cx'
import { formatDuration, parseDuration } from '../lib/format'
import { PLAN_AMOUNT_MAX, PLAN_AMOUNT_MIN, PLAN_TIME_PRESETS, validatePlanTime } from '../lib/plan'
import { Button } from './Button'
import { Icon } from './Icon'
import styles from './PlanForm.module.css'

export interface PlanFormValue {
  amount: number
  /** Текст поля «Сколько времени» как ввёл пользователь, «Ч:ММ» */
  time: string
}

interface PlanFormProps {
  id?: string
  value: PlanFormValue
  onChange: (value: PlanFormValue) => void
  onSubmit: () => void
  /** Подсказка под «Сколько задач» (в Sheet) */
  showAmountHint?: boolean
  wide?: boolean
  /** Кнопка отправки внутри формы (в пустом состоянии экрана) */
  children?: ReactNode
}

/** Параметры плана дня: Stepper «Сколько задач» и TimeInput «Сколько времени» с пресетами. */
export function PlanForm({ id, value, onChange, onSubmit, showAmountHint = false, wide = false, children }: PlanFormProps) {
  const uid = useId()
  const amountLabelId = `${uid}-amount`
  const timeId = `${uid}-time`
  const hintId = `${uid}-time-hint`
  const { error } = validatePlanTime(value.time)
  const currentMinutes = parseDuration(value.time)

  const setAmount = (amount: number) => onChange({ ...value, amount })
  const setTime = (time: string) => onChange({ ...value, time })

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!error) onSubmit()
  }

  return (
    <form id={id} className={cx(styles.form, wide && styles.wide)} onSubmit={handleSubmit} noValidate>
      <div>
        <span className={styles.label} id={amountLabelId}>
          Сколько задач
        </span>
        <div className={styles.stepper} role="group" aria-labelledby={amountLabelId}>
          <Button
            variant="icon"
            className={styles.stepperButton}
            aria-label="Меньше"
            disabled={value.amount <= PLAN_AMOUNT_MIN}
            onClick={() => setAmount(value.amount - 1)}
          >
            <Icon name="minus" size="sm" />
          </Button>
          <output className={styles.stepperValue} aria-live="polite">
            {value.amount}
          </output>
          <Button
            variant="icon"
            className={styles.stepperButton}
            aria-label="Больше"
            disabled={value.amount >= PLAN_AMOUNT_MAX}
            onClick={() => setAmount(value.amount + 1)}
          >
            <Icon name="plus" size="sm" />
          </Button>
        </div>
        {showAmountHint && (
          <span className={styles.hint}>
            От {PLAN_AMOUNT_MIN} до {PLAN_AMOUNT_MAX}. Будут выбраны задачи с наибольшим приоритетом.
          </span>
        )}
      </div>

      <div className={styles.timeField}>
        <label className={styles.label} htmlFor={timeId}>
          Сколько времени
        </label>
        <span className={cx(styles.timeInput, error && styles.timeInputError)}>
          <input
            id={timeId}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="0:00"
            value={value.time}
            aria-describedby={hintId}
            aria-invalid={Boolean(error)}
            onChange={(e) => setTime(e.target.value)}
            onBlur={() => {
              const minutes = parseDuration(value.time)
              if (minutes !== null) setTime(formatDuration(minutes))
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
              onClick={() => setTime(formatDuration(minutes))}
            >
              {formatDuration(minutes)}
            </button>
          ))}
        </div>
        <span className={cx(styles.hint, error && styles.hintError)} id={hintId}>
          {error ?? 'Например, 2:30. От 0:15 до 16:00.'}
        </span>
      </div>
      {children}
    </form>
  )
}
