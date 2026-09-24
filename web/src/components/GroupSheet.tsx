import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { ApiError } from '../api/client'
import type { Group } from '../api/types'
import { plural } from '../lib/format'
import { GROUP_NAME_MAX, GROUP_WEIGHT_MAX, GROUP_WEIGHT_MIN, validateGroupName } from '../lib/groups'
import { Alert } from './Alert'
import { Button } from './Button'
import styles from './Form.module.css'
import { FieldHint, Input } from './FormParts'
import { Sheet } from './Sheet'
import { Stepper } from './Stepper'

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

function weightHint(weight: number, mode: GroupSheetMode): string {
  if (mode.kind === 'edit' && weight !== mode.group.GroupPriority) {
    const count = mode.activeTaskCount
    const was = `Было ×${mode.group.GroupPriority}.`
    if (count === 0) return `${was} Активных задач в группе нет — пересчитывать нечего.`
    const up = weight > mode.group.GroupPriority
    const move = count === 1 ? (up ? 'она поднимется' : 'она опустится') : up ? 'они поднимутся' : 'они опустятся'
    const tasks = plural(count, ['активной задачи', 'активных задач', 'активных задач'])
    return `${was} Приоритет ${count} ${tasks} группы пересчитается — ${move} в списке.`
  }
  if (weight === 1) return `×1 — как у задач без группы. Чем больше вес, тем выше задачи группы. От ×${GROUP_WEIGHT_MIN} до ×${GROUP_WEIGHT_MAX}.`
  return `Задачи группы будут в ${weight} ${plural(weight, ['раз', 'раза', 'раз'])} важнее задач без группы.`
}

/** Sheet с GroupForm: создание и изменение группы (название + вес ×1…×10). */
export function GroupSheet({ mode, groups, onClose, onSubmit, footer }: GroupSheetProps) {
  const uid = useId()
  const nameId = `${uid}-name`
  const weightLabelId = `${uid}-weight`
  const editing = mode.kind === 'edit' ? mode.group : null

  const [name, setName] = useState(editing?.Name ?? '')
  const [weight, setWeight] = useState(editing?.GroupPriority ?? 1)
  const [touched, setTouched] = useState(false)
  const [pending, setPending] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<string | null>(null)

  const nameError = validateGroupName(name, groups, editing?.GroupId) ?? (conflict && name === conflict ? 'Группа с таким названием уже есть' : null)
  const showNameError = touched && nameError
  // Вес существующей группы мог быть больше 10 (старые данные) — тогда верхняя граница равна ему
  const maxWeight = Math.max(GROUP_WEIGHT_MAX, editing?.GroupPriority ?? 0)
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
          <span className={styles.label} id={weightLabelId}>
            Вес в приоритете
          </span>
          <Stepper
            labelledBy={weightLabelId}
            value={weight}
            min={GROUP_WEIGHT_MIN}
            max={maxWeight}
            onChange={setWeight}
            format={(v) => `×${v}`}
            disabled={pending}
          />
          <FieldHint>{weightHint(weight, mode)}</FieldHint>
        </div>
      </form>
    </Sheet>
  )
}
