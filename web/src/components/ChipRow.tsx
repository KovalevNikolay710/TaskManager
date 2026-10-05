import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type SyntheticEvent } from 'react'
import { cx } from '../lib/cx'
import styles from './ChipRow.module.css'
import formStyles from './Form.module.css'
import { Icon, type IconName } from './Icon'

export interface ChipOption {
  key: string
  label: ReactNode
  ariaLabel?: string
  title?: string
  className?: string
  /** Чип «Другое…»: раскрывает поле под рядом (aria-expanded + aria-controls) */
  expands?: { expanded: boolean; controls: string }
}

/** click — нажатие (мышь, палец, Enter/Пробел на чипе); arrow — стрелки ←/→ внутри ряда */
export type ChipSelectSource = 'click' | 'arrow'

interface ChipRowProps {
  /** Подпись ряда для скринридеров (legend и aria-label группы) */
  label: string
  icon: IconName
  options: ChipOption[]
  /** key выбранного чипа */
  value: string | null
  onSelect: (key: string, source: ChipSelectSource) => void
  disabled?: boolean
  invalid?: boolean
  describedBy?: string
  id?: string
  /** Что-то после чипов в той же прокручиваемой области (skeleton, сообщение) */
  children?: ReactNode
}

/** Нажатие на чип не уводит фокус из поля названия: иначе на телефоне закроется клавиатура. */
const keepFocus = (event: SyntheticEvent) => event.preventDefault()

/**
 * ChipRow: ряд чипов с одиночным выбором в одну строку (radiogroup, стрелки ←/→, roving tabindex).
 * На мобильном прокручивается по горизонтали с затуханием справа, на десктопе чипы переносятся.
 */
export function ChipRow({ label, icon, options, value, onSelect, disabled = false, invalid = false, describedBy, id, children }: ChipRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [atEnd, setAtEnd] = useState(false)
  const selectedIndex = Math.max(0, options.findIndex((o) => o.key === value))

  // Затухание справа пропадает, когда ряд прокручен до конца
  useEffect(() => {
    const scroller = scrollRef.current
    if (!scroller) return
    const update = () => setAtEnd(scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 2)
    update()
    scroller.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      scroller.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [options.length])

  // При показе выбранный чип прокручивается в зону видимости (только по горизонтали, лист не двигается)
  useLayoutEffect(() => {
    const scroller = scrollRef.current
    const chip = scroller?.querySelector<HTMLElement>('[aria-checked="true"]')
    if (!scroller || !chip) return
    // .scroll — position: relative, поэтому offsetLeft считается от начала ряда
    const left = chip.offsetLeft
    const right = left + chip.offsetWidth
    if (left < scroller.scrollLeft) scroller.scrollLeft = left
    else if (right > scroller.scrollLeft + scroller.clientWidth) scroller.scrollLeft = right - scroller.clientWidth + 32
    // Только при монтировании: дальше пользователь прокручивает ряд сам
  }, [])

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    event.preventDefault()
    const next = (index + step + options.length) % options.length
    onSelect(options[next].key, 'arrow')
    const chip = scrollRef.current?.querySelectorAll<HTMLElement>('[role="radio"]')[next]
    chip?.focus()
    chip?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }

  return (
    <fieldset className={cx(styles.row, atEnd && styles.end)} id={id} aria-describedby={describedBy}>
      <legend className="visually-hidden">{label}</legend>
      <span className={styles.lead} aria-hidden="true">
        <Icon name={icon} size="sm" />
      </span>
      <div className={styles.scroll} role="radiogroup" aria-label={label} aria-invalid={invalid || undefined} ref={scrollRef}>
        {options.map((option, index) => (
          <button
            key={option.key}
            type="button"
            role="radio"
            className={cx(formStyles.chip, styles.chip, option.expands && styles.other, option.className)}
            aria-checked={option.key === value}
            aria-label={option.ariaLabel}
            aria-expanded={option.expands?.expanded}
            aria-controls={option.expands?.controls}
            title={option.title}
            tabIndex={index === selectedIndex ? 0 : -1}
            disabled={disabled}
            onPointerDown={keepFocus}
            onMouseDown={keepFocus}
            onClick={() => onSelect(option.key, 'click')}
            onKeyDown={(e) => onKeyDown(e, index)}
          >
            {option.label}
          </button>
        ))}
        {children}
      </div>
    </fieldset>
  )
}
