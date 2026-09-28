import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { ApiError } from '../api/client'
import type { Group } from '../api/types'
import { plural } from '../lib/format'
import { GROUP_NAME_MAX, validateGroupName } from '../lib/groups'
import { clampWeight } from '../lib/weight'
import { Alert } from './Alert'
import { Button } from './Button'
import styles from './Form.module.css'
import { FieldHint, Input } from './FormParts'
import { Sheet } from './Sheet'
import { WeightScale } from './WeightScale'

export interface GroupFormValues {
  name: string
  weight: number
}

type GroupSheetMode = { kind: 'create' } | { kind: 'edit'; group: Group; activeTaskCount: number }

interface GroupSheetProps {
  mode: GroupSheetMode
  /** Все группы пользователя — для проверки уникальности названия */
  groups: readonly Group[]
  onClose: () => void
  /** Ошибка ApiError показывается в Sheet (409 — у поля «Название»), Sheet остаётся открытым */
  onSubmit: (values: GroupFormValues) => Promise<void>
  /** Под кнопками: «Удалить группу» */
  footer?: ReactNode
}

/** «с группой «Работа»» / «с группами «Работа» и «Хобби»» — без склонения названий. */
function sameStepText(names: readonly string[]): string {
  const quoted = names.map((n) => `«${n}»`)
  if (quoted.length === 1) return `с группой ${quoted[0]}`
  return `с группами ${quoted.slice(0, -1).join(', ')} и ${quoted.at(-1)}`
}

function weightHint(weight: number, mode: GroupSheetMode, sameStep: readonly string[], name: string): string {
  const neighbours = sameStep.length ? sameStepText(sameStep) : ''
  if (mode.kind === 'edit' && weight !== mode.group.GroupPriority) {
    const count = mode.activeTaskCount
    const was = `Было ×${mode.group.GroupPriority}.`
    const step = neighbours ? ` ${name || mode.group.Name} встанет на одну ступень ${neighbours}.` : ''
    if (count === 0) return `${was}${step} Активных задач в группе нет — пересчитывать нечего.`
    const up = weight > mode.group.GroupPriority
    const move = count === 1 ? (up ? 'она поднимется' : 'она опустится') : up ? 'они поднимутся' : 'они опустятся'
    const tasks = plural(count, ['активной задачи', 'активных задач', 'активных задач'])
    return `${was}${step} Приоритет ${count} ${tasks} группы пересчитается — ${move} в списке.`
  }
  const step = neighbours ? ` Встанет на одну ступень ${neighbours}.` : ''
  if (weight === 1) {
    const hint = mode.kind === 'create' ? ' Чтобы поставить группу между другими, после создания перетащите её на лесенке.' : ''
    return `×1 — как у задач без группы.${hint}`
  }
  return `Задачи группы будут в ${weight} ${plural(weight, ['раз', 'раза', 'раз'])} важнее задач без группы.${step}`
}

/** Какие ступени заняты другими группами: вес → названия (по алфавиту). */
function occupiedSteps(groups: readonly Group[], excludeId?: number): Map<number, string[]> {
  const steps = new Map<number, string[]>()
  for (const group of groups) {
    if (group.GroupId === excludeId) continue
    const weight = clampWeight(group.GroupPriority)
    steps.set(weight, [...(steps.get(weight) ?? []), group.Name])
  }
  for (const names of steps.values()) names.sort((a, b) => a.localeCompare(b, 'ru'))
  return steps
}

/** Sheet с GroupForm: создание и изменение группы (название + WeightScale ×1…×10). */
export function GroupSheet({ mode, groups, onClose, onSubmit, footer }: GroupSheetProps) {
  const uid = useId()
  const nameId = `${uid}-name`
  const weightLabelId = `${uid}-weight`
  const weightHintId = `${uid}-weight-hint`
  const editing = mode.kind === 'edit' ? mode.group : null

  const [name, setName] = useState(editing?.Name ?? '')
  const [weight, setWeight] = useState(editing?.GroupPriority ?? 1)
  const [touched, setTouched] = useState(false)
  const [pending, setPending] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<string | null>(null)

  const nameError = validateGroupName(name, groups, editing?.GroupId) ?? (conflict && name === conflict ? 'Группа с таким названием уже есть' : null)
  const showNameError = touched && nameError
  const occupied = occupiedSteps(groups, editing?.GroupId)
  const changed = !editing || name.trim() !== editing.Name || weight !== editing.GroupPriority

  const submit = async (event?: FormEvent) => {
    event?.preventDefault()
    setTouched(true)
    if (nameError || pending || !changed) {
      if (nameError) document.getElementById(nameId)?.focus()
      return
    }
    setPending(true)
    setServerError(null)
    try {
      await onSubmit({ name: name.trim(), weight })
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setConflict(name)
        document.getElementById(nameId)?.focus()
      } else {
        setServerError(error instanceof ApiError && error.status === 0 ? 'Не удалось связаться с сервером. Попробуйте ещё раз.' : error instanceof Error ? error.message : 'Неизвестная ошибка')
      }
    } finally {
      setPending(false)
    }
  }

  const formId = `${uid}-form`
  return (
    <Sheet
      title={editing ? `Группа «${editing.Name}»` : 'Новая группа'}
      onClose={onClose}
      dismissible={!pending}
      footer={footer}
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Отмена
          </Button>
          <Button variant="primary" type="submit" form={formId} loading={pending} disabled={!changed}>
            {pending ? (editing ? 'Сохраняем…' : 'Создаём…') : editing ? 'Сохранить' : 'Создать группу'}
          </Button>
        </>
      }
    >
      <form id={formId} className={styles.form} style={{ gap: 'var(--space-6)' }} onSubmit={(e) => void submit(e)} noValidate>
        {serverError && <Alert title={editing ? 'Не удалось сохранить группу' : 'Не удалось создать группу'}>{serverError}</Alert>}
        <div className={styles.field}>
          <label className={styles.label} htmlFor={nameId}>
            Название
          </label>
          <Input
            id={nameId}
            type="text"
            maxLength={GROUP_NAME_MAX}
            autoComplete="off"
            placeholder="Например, учёба"
            value={name}
            disabled={pending}
            invalid={Boolean(showNameError)}
            aria-describedby={showNameError ? `${nameId}-error` : undefined}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setTouched(true)}
          />
          {showNameError && (
            <FieldHint id={`${nameId}-error`} tone="error">
              {nameError}
            </FieldHint>
          )}
        </div>
        <div className={styles.field}>
          <WeightScale
            labelId={weightLabelId}
            hintId={weightHintId}
            label="Вес в приоритете"
            value={weight}
            onChange={setWeight}
            occupied={occupied}
            disabled={pending}
          />
          <FieldHint id={weightHintId}>{weightHint(weight, mode, occupied.get(clampWeight(weight)) ?? [], name.trim())}</FieldHint>
        </div>
      </form>
    </Sheet>
  )
}
