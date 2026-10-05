import { useRef, type KeyboardEvent } from 'react'
import formStyles from './Form.module.css'

export interface RadioChipOption<T extends string | number> {
  value: T
  label: string
  ariaLabel?: string
}

interface RadioChipsProps<T extends string | number> {
  options: ReadonlyArray<RadioChipOption<T>>
  value: T
  onChange: (value: T) => void
  /** id подписей группы (название настройки и «За») */
  labelledBy: string
  disabled?: boolean
}

/** Чипы с одиночным выбором (radiogroup): стрелки ←/→ переключают выбор, Tab — один чип в ряду. */
export function RadioChips<T extends string | number>({ options, value, onChange, labelledBy, disabled = false }: RadioChipsProps<T>) {
  const groupRef = useRef<HTMLDivElement>(null)
  const selected = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  )

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key]
    if (!step) return
    event.preventDefault()
    const next = (selected + step + options.length) % options.length
    onChange(options[next].value)
    groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus()
  }

  return (
    <div className={formStyles.chips} role="radiogroup" aria-labelledby={labelledBy} ref={groupRef} onKeyDown={onKeyDown}>
      {options.map((option, i) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          className={formStyles.chip}
          aria-checked={option.value === value}
          aria-label={option.ariaLabel}
          tabIndex={i === selected ? 0 : -1}
          disabled={disabled}
          onClick={() => {
            if (option.value !== value) onChange(option.value)
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
