import { useId, type FocusEvent, type Ref } from 'react'
import { combineDateTime, describeDeadlineInput } from '../lib/dates'
import { DEFAULT_DEADLINE_TIME, deadlinePresets } from '../lib/taskForm'
import styles from './Form.module.css'
import { FieldHint, Input } from './FormParts'

interface DeadlineFieldProps {
  /** «YYYY-MM-DD» */
  date: string
  /** «HH:MM» */
  time: string
  onChange: (date: string, time: string) => void
  /** Фокус ушёл из поля целиком (дата и время) */
  onBlur?: () => void
  error?: string
  /** Быстрые варианты дедлайна (на экране «Новая задача») */
  presets?: boolean
  disabled?: boolean
  now: Date
  dateRef?: Ref<HTMLInputElement>
}

/** DeadlineField: дата + время, пресеты и живая расшифровка «завтра, 10:00 — через 20 ч». */
export function DeadlineField({ date, time, onChange, onBlur, error, presets = false, disabled = false, now, dateRef }: DeadlineFieldProps) {
  const hintId = useId()
  const deadline = combineDateTime(date, time)
  const described = deadline ? describeDeadlineInput(deadline, now) : null

  const handleBlur = (event: FocusEvent<HTMLFieldSetElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onBlur?.()
  }

  return (
    <fieldset className={styles.field} aria-describedby={hintId} onBlur={handleBlur} disabled={disabled}>
      <legend className={styles.label}>Дедлайн</legend>
      <div className={styles.row}>
        <Input
          ref={dateRef}
          type="date"
          aria-label="Дата дедлайна"
          value={date}
          invalid={Boolean(error)}
          aria-describedby={hintId}
          // Выбрана только дата — время по умолчанию 18:00
          onChange={(e) => onChange(e.target.value, time || (e.target.value ? DEFAULT_DEADLINE_TIME : ''))}
        />
        <Input
          type="time"
          aria-label="Время дедлайна"
          value={time}
          invalid={Boolean(error)}
          aria-describedby={hintId}
          onChange={(e) => onChange(date, e.target.value)}
        />
      </div>
      {presets && (
        <div className={styles.chips} role="group" aria-label="Быстрый выбор дедлайна">
          {deadlinePresets(now).map((preset) => (
            <button
              key={preset.label}
              type="button"
              className={styles.chip}
              aria-pressed={preset.date === date && preset.time === time}
              onClick={() => onChange(preset.date, preset.time)}
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}
      {error ? (
        <FieldHint id={hintId} tone="error">
          {error}
        </FieldHint>
      ) : described ? (
        <FieldHint id={hintId} tone={described.tone === 'normal' ? 'default' : described.tone} icon="flag">
          {described.text}
        </FieldHint>
      ) : (
        <FieldHint id={hintId}>
          {presets ? 'Выберите дату и время или нажмите вариант выше. Не раньше чем через час.' : 'Не раньше чем через час.'}
        </FieldHint>
      )}
    </fieldset>
  )
}
