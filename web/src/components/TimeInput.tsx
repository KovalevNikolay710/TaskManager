import { useId, type Ref } from 'react'
import { cx } from '../lib/cx'
import { formatDuration, parseDuration } from '../lib/format'
import { TASK_TIME_PRESETS } from '../lib/taskForm'
import styles from './Form.module.css'
import { FieldHint } from './FormParts'

interface TimeInputProps {
  label: string
  /** Текст поля «Ч:ММ» как ввёл пользователь */
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  error?: string
  warning?: string
  hint?: string
  presets?: boolean
  disabled?: boolean
  inputRef?: Ref<HTMLInputElement>
  /** Подпись только для скринридеров (в «Быстрой задаче» её заменяет иконка ряда) */
  labelHidden?: boolean
}

/** TimeInput для времени на выполнение задачи: «ч:мм», пресеты 0:30 / 1:00 / 2:00 / 4:00. */
export function TimeInput({ label, value, onChange, onBlur, error, warning, hint, presets = false, disabled = false, inputRef, labelHidden = false }: TimeInputProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const current = parseDuration(value)

  return (
    <div className={styles.timeField}>
      <label className={labelHidden ? 'visually-hidden' : styles.label} htmlFor={id}>
        {label}
      </label>
      <span className={cx(styles.timeInput, error && styles.timeInputError)}>
        <input
          ref={inputRef}
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="0:00"
          value={value}
          disabled={disabled}
          aria-describedby={hint || error || warning ? hintId : undefined}
          aria-invalid={Boolean(error) || undefined}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => {
            const minutes = parseDuration(value)
            if (minutes !== null) onChange(formatDuration(minutes))
            onBlur?.()
          }}
        />
        <span className={styles.unit}>ч:мм</span>
      </span>
      {presets && (
        <div className={styles.chips} role="group" aria-label="Быстрый выбор времени">
          {TASK_TIME_PRESETS.map((minutes) => (
            <button
              key={minutes}
              type="button"
              className={styles.chip}
              disabled={disabled}
              aria-pressed={current === minutes}
              onClick={() => onChange(formatDuration(minutes))}
            >
              {formatDuration(minutes)}
            </button>
          ))}
        </div>
      )}
      {error ? (
        <FieldHint id={hintId} tone="error">
          {error}
        </FieldHint>
      ) : warning ? (
        <FieldHint id={hintId} tone="warning" icon="alert">
          {warning}
        </FieldHint>
      ) : (
        hint && <FieldHint id={hintId}>{hint}</FieldHint>
      )}
    </div>
  )
}
