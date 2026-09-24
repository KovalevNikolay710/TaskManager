import { useId, type CSSProperties, type ReactNode, type Ref } from 'react'
import { cx } from '../lib/cx'
import { Button } from './Button'
import { FieldHint } from './FormParts'
import { Icon } from './Icon'
import styles from './TaskDetail.module.css'

interface TitleInputProps {
  value: string
  onChange: (value: string) => void
  onBlur: () => void
  done: boolean
  error?: string
  disabled?: boolean
  inputRef?: Ref<HTMLTextAreaElement>
}

/** TitleInput: название задачи, редактируемое «на месте»; Enter снимает фокус. */
export function TitleInput({ value, onChange, onBlur, done, error, disabled = false, inputRef }: TitleInputProps) {
  const id = useId()
  return (
    <div>
      <label className="visually-hidden" htmlFor={id}>
        Название задачи
      </label>
      <textarea
        ref={inputRef}
        id={id}
        rows={1}
        maxLength={200}
        className={cx(styles.titleInput, done && styles.titleDone, error && styles.titleInputError)}
        value={value}
        disabled={disabled}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => onChange(e.target.value.replace(/\n/g, ' '))}
        onBlur={onBlur}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
            e.preventDefault()
            e.currentTarget.blur()
          }
        }}
      />
      {error && (
        <FieldHint id={`${id}-error`} tone="error">
          {error}
        </FieldHint>
      )}
    </div>
  )
}

/** StatusBanner: задача выполнена + «Вернуть в работу». */
export function StatusBanner({ completedAt, pending, onReopen }: { completedAt: string; pending: boolean; onReopen: () => void }) {
  return (
    <div className={styles.banner} role="status">
      <Icon name="checkCircle" className={styles.bannerIcon} />
      <span className={styles.bannerBody}>
        <span className={styles.bannerTitle}>Выполнена</span>
        <span className={styles.bannerSub}>Отмечена {completedAt}</span>
      </span>
      <Button variant="secondary" loading={pending} onClick={onReopen}>
        {!pending && <Icon name="undo" size="sm" />}
        {pending ? 'Возвращаем…' : 'Вернуть в работу'}
      </Button>
    </div>
  )
}

/** Кнопка «Отметить выполненной» на месте StatusBanner у активной задачи. */
export function CompleteButton({ pending, disabled, onClick }: { pending: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <Button variant="secondary" block loading={pending} disabled={disabled} onClick={onClick}>
      {!pending && <Icon name="check" size="sm" className={styles.checkIcon} />}
      {pending ? 'Отмечаем…' : 'Отметить выполненной'}
    </Button>
  )
}

const STEPS = [0, 25, 50, 75, 100]

interface PercentSliderProps {
  value: number
  onChange: (value: number) => void
  /** Задача выполнена — прогресс меняется только после возврата в работу */
  locked: boolean
  disabled?: boolean
}

/** PercentSlider: прогресс 0–100 с шагом 5 и быстрыми шагами. */
export function PercentSlider({ value, onChange, locked, disabled = false }: PercentSliderProps) {
  const id = useId()
  const off = locked || disabled
  return (
    <div className={styles.percent}>
      <div className={styles.percentHead}>
        <label className={styles.percentLabel} htmlFor={id}>
          Выполнено
        </label>
        <output className={styles.percentValue} htmlFor={id}>
          {value}%
        </output>
      </div>
      <input
        id={id}
        className={styles.range}
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        disabled={off}
        style={{ '--value': `${value}%` } as CSSProperties}
        aria-describedby={`${id}-hint`}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className={styles.steps} role="group" aria-label="Быстрый выбор прогресса">
        {STEPS.map((step) => (
          <button key={step} type="button" className={styles.step} aria-pressed={value === step} disabled={off} onClick={() => onChange(step)}>
            {step}%
          </button>
        ))}
      </div>
      <FieldHint id={`${id}-hint`}>
        {locked ? 'Чтобы изменить прогресс, верните задачу в работу.' : value === 100 ? 'При сохранении задача станет выполненной.' : 'На 100% задача станет выполненной.'}
      </FieldHint>
    </div>
  )
}

export function MetaNote({ children }: { children: string }) {
  return <p className={styles.metaNote}>{children}</p>
}

export function DangerZone({ children }: { children: ReactNode }) {
  return <div className={styles.dangerZone}>{children}</div>
}
