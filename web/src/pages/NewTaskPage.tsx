import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../api/client'
import { ActionBar } from '../components/ActionBar'
import { Alert } from '../components/Alert'
import { AppShell } from '../components/AppShell'
import { Button } from '../components/Button'
import { ConfirmSheet } from '../components/ConfirmSheet'
import { DeadlineField } from '../components/DeadlineField'
import { Field, FieldHint, FieldLabel, FormCard, Input, Textarea } from '../components/FormParts'
import { GroupPicker } from '../components/GroupPicker'
import { GroupSheet, type GroupFormValues } from '../components/GroupSheet'
import { PageHeader } from '../components/PageHeader'
import { PriorityCard } from '../components/PriorityCard'
import { TimeInput } from '../components/TimeInput'
import { useBeforeUnload } from '../hooks/useBeforeUnload'
import { useGoBack } from '../hooks/useGoBack'
import { useCreateGroup } from '../hooks/useGroupMutations'
import { useGroups } from '../hooks/useGroups'
import { useNow } from '../hooks/useNow'
import { queryKeys } from '../hooks/queryKeys'
import { useCreateTask } from '../hooks/useTaskMutations'
import { useTasks } from '../hooks/useTasks'
import { useToast } from '../hooks/useToast'
import { combineDateTime, describeDeadline, toLocalRFC3339 } from '../lib/dates'
import { parseDuration } from '../lib/format'
import { requestTaskHighlight } from '../lib/highlight'
import { futurePlaceText } from '../lib/ordinal'
import { calculatePriority, groupLabel, groupWeight, hoursUntil, priorityFactorRows, queuePlace } from '../lib/priority'
import { readLastGroupId, writeLastGroupId } from '../lib/storage'
import {
  DEADLINE_TOO_CLOSE,
  TASK_DESCRIPTION_MAX,
  TASK_NAME_MAX,
  durationWarning,
  validateDeadline,
  validateDuration,
  validateTaskName,
  type TaskField,
  type TaskFormValues,
} from '../lib/taskForm'
import { maxActivePriority, priorityLevel } from '../lib/tasks'
import styles from './TaskForm.module.css'

const PARENT_PATH = '/all-tasks'

type Overlay = { kind: 'group' } | { kind: 'leave'; then: () => void } | null

function emptyValues(): TaskFormValues {
  return { name: '', description: '', date: '', time: '', duration: '', percent: 0, groupId: readLastGroupId() }
}

function isBlank(values: TaskFormValues): boolean {
  return !values.name.trim() && !values.description.trim() && !values.date && !values.time && !values.duration.trim()
}

/** Текст под числом предпросмотра — по месту в очереди. */
function placeHint(place: number, total: number): string {
  if (place === 1) return 'Задача окажется первой в списке: срок близко, а работы много.'
  if (place <= Math.ceil(total / 3)) return 'Задача окажется среди самых срочных.'
  return 'Срок позволяет: задача встанет ближе к концу списка.'
}

/** Экран «Новая задача» — design/screens/new-task.md. */
export function NewTaskPage() {
  const uid = useId()
  const formId = `${uid}-form`
  const navigate = useNavigate()
  const goBack = useGoBack(PARENT_PATH)
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const now = useNow()

  const groupsQuery = useGroups()
  const tasksQuery = useTasks()
  const createTask = useCreateTask()
  const createGroup = useCreateGroup()

  const [values, setValues] = useState(emptyValues)
  const [touched, setTouched] = useState<ReadonlySet<TaskField>>(new Set())
  const [serverDeadlineError, setServerDeadlineError] = useState<string | null>(null)
  const [alert, setAlert] = useState<{ title: string; text: string } | null>(null)
  const [overlay, setOverlay] = useState<Overlay>(null)
  const [focusRequest, setFocusRequest] = useState<number>()

  const nameRef = useRef<HTMLInputElement>(null)
  const dateRef = useRef<HTMLInputElement>(null)
  const durationRef = useRef<HTMLInputElement>(null)

  const groups = groupsQuery.data
  // Последняя группа могла быть удалена — тогда «Без группы»
  const groupId = groups && values.groupId !== 0 && !groups.some((g) => g.GroupId === values.groupId) ? 0 : values.groupId
  const submitting = createTask.isPending
  const blank = isBlank(values)

  const errors: Partial<Record<TaskField, string>> = {
    name: validateTaskName(values.name),
    deadline: serverDeadlineError ?? validateDeadline(values.date, values.time, now),
    duration: validateDuration(values.duration),
  }
  const shown = (field: TaskField) => (touched.has(field) ? errors[field] : undefined)
  const touch = (field: TaskField) => setTouched((prev) => new Set(prev).add(field))

  useBeforeUnload(!blank && !createTask.isSuccess)

  const update = (patch: Partial<TaskFormValues>) => {
    setValues((prev) => ({ ...prev, ...patch }))
    setAlert(null)
  }

  const requestLeave = (then: () => void) => {
    if (blank || submitting) {
      if (!submitting) then()
      return
    }
    setOverlay({ kind: 'leave', then })
  }

  // Esc — как «Отмена», если не открыт Sheet (он закрывается сам)
  const requestLeaveRef = useRef(requestLeave)
  useEffect(() => {
    requestLeaveRef.current = requestLeave
  })
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || document.querySelector('[aria-modal="true"]')) return
      requestLeaveRef.current(goBack)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [goBack])

  const submit = async (event?: FormEvent) => {
    event?.preventDefault()
    if (submitting) return
    setTouched(new Set<TaskField>(['name', 'deadline', 'duration']))
    if (errors.name) return nameRef.current?.focus()
    if (errors.deadline) return dateRef.current?.focus()
    if (errors.duration) return durationRef.current?.focus()

    const deadline = combineDateTime(values.date, values.time)
    const minutes = parseDuration(values.duration)
    if (!deadline || minutes === null) return

    setAlert(null)
    try {
      const task = await createTask.mutateAsync({
        name: values.name.trim(),
        description: values.description.trim(),
        deadline: toLocalRFC3339(deadline),
        timeForExecution: minutes,
        percentOfCompleting: 0,
        groupId,
      })
      writeLastGroupId(task.GroupId)
      requestTaskHighlight({ taskId: task.TaskId, groupId: task.GroupId })
      goBack()
      const lostGroup = groupId !== 0 && task.GroupId === 0
      if (lostGroup) void queryClient.invalidateQueries({ queryKey: queryKeys.groups })
      showToast({
        message: lostGroup ? 'Задача создана без группы: группа не найдена' : 'Задача создана',
        action: { label: 'Открыть', onClick: () => navigate(`/tasks/${task.TaskId}`) },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Неизвестная ошибка'
      const status = error instanceof ApiError ? error.status : -1
      if (status === 0) {
        setAlert({ title: 'Не удалось создать задачу', text: 'Не удалось связаться с сервером. Всё, что вы ввели, сохранено — попробуйте ещё раз.' })
      } else if (status === 400 && message.includes('дедлайн')) {
        // Дедлайн успел стать ближе часа, пока заполняли форму
        setServerDeadlineError(DEADLINE_TOO_CLOSE)
        dateRef.current?.focus()
      } else if (status === 400 && message.includes('группа')) {
        void groupsQuery.refetch()
        setAlert({ title: 'Не удалось создать задачу', text: 'Выбранная группа не найдена — возможно, её удалили. Выберите другую группу.' })
      } else if (status === 400) {
        setAlert({ title: 'Сервер не принял данные', text: message })
      } else {
        setAlert({ title: 'Не удалось создать задачу', text: message })
      }
    }
  }

  const onFormKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      void submit()
    }
  }

  const addGroup = async ({ name, weight }: GroupFormValues) => {
    const group = await createGroup.mutateAsync({ name, groupPriority: weight })
    update({ groupId: group.GroupId })
    setOverlay(null)
    setFocusRequest((n) => (n ?? 0) + 1)
  }

  const renderPreview = () => {
    const deadline = combineDateTime(values.date, values.time)
    const minutes = parseDuration(values.duration)
    if (!deadline || minutes === null || errors.deadline || errors.duration) {
      return <PriorityCard state="empty" text="Укажите дедлайн и время на выполнение — покажем, каким по счёту задача встанет в списке." />
    }
    const weight = groupWeight(groupId, groups)
    const hours = hoursUntil(deadline, now)
    const priority = calculatePriority({ groupWeight: weight, minutes, hours, percent: 0 })
    const tasks = tasksQuery.data
    const queue = tasks ? queuePlace(priority, tasks) : null
    const level = priorityLevel(priority, Math.max(maxActivePriority(tasks ?? []), priority))
    return (
      <PriorityCard
        state="active"
        priority={priority}
        level={level}
        rank={queue ? futurePlaceText(queue.place, queue.total) : undefined}
        text={queue ? placeHint(queue.place, queue.total) : 'Чем ближе дедлайн и больше работы, тем выше задача в списке.'}
        factors={priorityFactorRows({
          groupName: groupLabel(groupId, groups),
          groupWeight: weight,
          minutes,
          hours,
          hoursSub: describeDeadline(deadline.toISOString(), now).text,
          percent: 0,
        })}
      />
    )
  }

  return (
    <AppShell bottomNav={false}>
      <PageHeader title="Новая задача" onBack={() => requestLeave(goBack)} />

      <form id={formId} className={styles.form} noValidate onSubmit={(e) => void submit(e)} onKeyDown={onFormKeyDown} aria-label="Новая задача">
        {alert && <Alert title={alert.title}>{alert.text}</Alert>}

        <FormCard title="Что сделать" titleId={`${uid}-what`}>
          <Field>
            <FieldLabel htmlFor={`${uid}-name`}>Название</FieldLabel>
            <Input
              ref={nameRef}
              id={`${uid}-name`}
              type="text"
              maxLength={TASK_NAME_MAX}
              autoComplete="off"
              autoFocus
              placeholder="Например, подготовить отчёт по ТИПИС"
              value={values.name}
              disabled={submitting}
              invalid={Boolean(shown('name'))}
              aria-describedby={shown('name') ? `${uid}-name-error` : undefined}
              onChange={(e) => update({ name: e.target.value })}
              onBlur={() => touch('name')}
            />
            {shown('name') && (
              <FieldHint id={`${uid}-name-error`} tone="error">
                {shown('name')}
              </FieldHint>
            )}
          </Field>
          <Field>
            <FieldLabel htmlFor={`${uid}-description`} optional>
              Описание
            </FieldLabel>
            <Textarea
              id={`${uid}-description`}
              rows={3}
              maxLength={TASK_DESCRIPTION_MAX}
              placeholder="Детали, ссылки, что именно сдать"
              value={values.description}
              disabled={submitting}
              onChange={(e) => update({ description: e.target.value })}
            />
          </Field>
        </FormCard>

        <FormCard title="Срок и объём" titleId={`${uid}-when`}>
          <DeadlineField
            date={values.date}
            time={values.time}
            now={now}
            presets
            disabled={submitting}
            dateRef={dateRef}
            error={shown('deadline')}
            onChange={(date, time) => {
              setServerDeadlineError(null)
              update({ date, time })
            }}
            onBlur={() => touch('deadline')}
          />
          <TimeInput
            label="Время на выполнение"
            value={values.duration}
            presets
            disabled={submitting}
            inputRef={durationRef}
            error={shown('duration')}
            warning={errors.deadline ? undefined : durationWarning(values.date, values.time, values.duration, now)}
            hint="Сколько чистого времени займёт работа, например 1:30."
            onChange={(duration) => update({ duration })}
            onBlur={() => touch('duration')}
          />
        </FormCard>

        <FormCard title="Группа" titleId={`${uid}-group`}>
          <GroupPicker
            labelledBy={`${uid}-group`}
            groups={groups}
            loading={groupsQuery.isPending}
            failed={groupsQuery.isError}
            onRetry={() => void groupsQuery.refetch()}
            value={groupId}
            onChange={(id) => update({ groupId: id })}
            onAdd={() => setOverlay({ kind: 'group' })}
            onManage={() => requestLeave(() => navigate('/groups'))}
            disabled={submitting}
            focusRequest={focusRequest}
          />
        </FormCard>

        {renderPreview()}

        <ActionBar note="Задача сразу встанет в список по приоритету">
          <Button variant="secondary" disabled={submitting} onClick={() => requestLeave(goBack)}>
            Отмена
          </Button>
          <Button variant="primary" type="submit" loading={submitting}>
            {submitting ? 'Создаём…' : 'Создать задачу'}
          </Button>
        </ActionBar>
      </form>

      {overlay?.kind === 'group' && (
        <GroupSheet mode={{ kind: 'create' }} groups={groups ?? []} onClose={() => setOverlay(null)} onSubmit={addGroup} />
      )}
      {overlay?.kind === 'leave' && (
        <ConfirmSheet
          title="Выйти без сохранения?"
          confirmLabel="Выйти"
          cancelLabel="Остаться"
          onCancel={() => setOverlay(null)}
          onConfirm={() => {
            setOverlay(null)
            overlay.then()
          }}
        >
          Введённые данные пропадут.
        </ConfirmSheet>
      )}
    </AppShell>
  )
}
