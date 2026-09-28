import { useEffect, useRef, type KeyboardEvent } from 'react'
import type { Group } from '../api/types'
import { cx } from '../lib/cx'
import { NO_GROUP_ID, sortGroups } from '../lib/groups'
import { weightClass } from '../lib/weight'
import { Button } from './Button'
import styles from './Form.module.css'
import { FieldHint } from './FormParts'
import { Icon } from './Icon'

const NAME_LIMIT = 24

interface GroupPickerProps {
  labelledBy: string
  groups: Group[] | undefined
  loading: boolean
  failed: boolean
  onRetry: () => void
  /** GroupId, 0 — без группы */
  value: number
  onChange: (groupId: number) => void
  onAdd: () => void
  onManage: () => void
  disabled?: boolean
  /** Меняется, когда нужно перевести фокус на выбранный чип (после создания группы) */
  focusRequest?: number
}

function shortName(name: string): string {
  return name.length > NAME_LIMIT ? `${name.slice(0, NAME_LIMIT - 1)}…` : name
}

/** GroupPicker: чипы групп с одиночным выбором (radiogroup, стрелки ←/→) и «+ Новая группа». */
export function GroupPicker({ labelledBy, groups, loading, failed, onRetry, value, onChange, onAdd, onManage, disabled = false, focusRequest }: GroupPickerProps) {
  const groupRef = useRef<HTMLDivElement>(null)
  const options = [
    ...sortGroups(groups ?? []).map((g) => ({ id: g.GroupId, name: g.Name, weight: g.GroupPriority as number | undefined })),
    { id: NO_GROUP_ID, name: 'Без группы', weight: undefined },
  ]
  // Выбранной группы может не быть в списке (удалена) — тогда фокусируемым остаётся первый чип
  const selectedIndex = Math.max(0, options.findIndex((o) => o.id === value))

  useEffect(() => {
    if (focusRequest === undefined) return
    groupRef.current?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')?.focus()
  }, [focusRequest])

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    event.preventDefault()
    const next = (index + step + options.length) % options.length
    onChange(options[next].id)
    groupRef.current?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus()
  }

  return (
    <div className={styles.field}>
      <div className={styles.chips} role="radiogroup" aria-labelledby={labelledBy} ref={groupRef}>
        {loading && !groups && [0, 1, 2].map((i) => <span key={i} className={cx(styles.chip, styles.chipSkeleton)} aria-hidden="true" />)}
        {options.map((option, index) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            className={cx(styles.chip, styles.chipWeighted, weightClass(option.weight ?? 1))}
            aria-checked={option.id === value}
            aria-label={`${option.name}, вес ${option.weight ?? 1}`}
            tabIndex={index === selectedIndex ? 0 : -1}
            title={option.name.length > NAME_LIMIT ? option.name : undefined}
            disabled={disabled}
            onClick={() => onChange(option.id)}
            onKeyDown={(e) => onKeyDown(e, index)}
          >
            <span className={cx(styles.chipDot, option.weight === undefined && styles.chipDotBase)} aria-hidden="true" />
            <span className={styles.chipName}>{shortName(option.name)}</span>
            {option.weight !== undefined && (
              <span className={styles.chipWeight} aria-hidden="true">
                ×{option.weight}
              </span>
            )}
          </button>
        ))}
        <button type="button" className={cx(styles.chip, styles.chipAdd)} disabled={disabled} onClick={onAdd}>
          <Icon name="plus" size="sm" />
          Новая группа
        </button>
      </div>
      {failed && !groups && (
        <FieldHint tone="error">
          Не удалось загрузить группы{' '}
          <Button variant="ghost" onClick={onRetry}>
            Повторить
          </Button>
        </FieldHint>
      )}
      <FieldHint>
        Цвет и ×N — вес группы: он умножает приоритет задачи.{' '}
        <button type="button" className={styles.link} onClick={onManage}>
          Управлять группами
        </button>
      </FieldHint>
    </div>
  )
}
