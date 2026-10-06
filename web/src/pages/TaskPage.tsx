import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { TaskStatus, type Task, type TaskUpdateRequest } from '../api/types'
import { ActionBar } from '../components/ActionBar'
import { AppShell } from '../components/AppShell'
import { Button } from '../components/Button'
import { buttonClassName } from '../components/buttonClassName'
import { ConfirmSheet } from '../components/ConfirmSheet'
import { DeadlineField } from '../components/DeadlineField'
import { FormCard, Textarea } from '../components/FormParts'
import { GroupPicker } from '../components/GroupPicker'
import { GroupSheet, type GroupFormValues } from '../components/GroupSheet'
import { Icon } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'
import { PriorityCard } from '../components/PriorityCard'
import { Skeleton } from '../components/Skeleton'
import { StateMessage } from '../components/StateMessage'
import { CompleteButton, DangerZone, MetaNote, PercentSlider, StatusBanner, TitleInput } from '../components/TaskDetail'
import { TimeInput } from '../components/TimeInput'
import { useBeforeUnload } from '../hooks/useBeforeUnload'
import { useGoBack } from '../hooks/useGoBack'
import { useCreateGroup } from '../hooks/useGroupMutations'
import { useGroups } from '../hooks/useGroups'
import { useNow } from '../hooks/useNow'
import { useTask } from '../hooks/useTask'
import { useDeleteTask, useUpdateTask } from '../hooks/useTaskMutations'
import { useTasks } from '../hooks/useTasks'
import { useToast } from '../hooks/useToast'
import { combineDateTime, formatMetaDate, toLocalRFC3339 } from '../lib/dates'
import { formatPriority, parseDuration } from '../lib/format'
import { placeText } from '../lib/ordinal'
import { calculatePriority, groupLabel, groupWeight, hoursUntil, priorityFactorRows, queuePlace } from '../lib/priority'
import {
  DEADLINE_TOO_CLOSE,
  TASK_DESCRIPTION_MAX,
  taskToFormValues,
  validateDeadline,
  validateDuration,
  validateTaskName,
  type TaskField,
  type TaskFormValues,
} from '../lib/taskForm'
import { isDone, maxActivePriority, priorityLevel } from '../lib/tasks'
import styles from './TaskForm.module.css'

const PARENT_PATH = '/all-tasks'

interface Draft {
  /** Серверная версия, от которой считаются изменения */
  source: Task
  values: TaskFormValues
}

type Overlay = { kind: 'group' } | { kind: 'leave'; then: () => void } | { kind: 'delete' } | null
type Pending = 'save' | 'complete' | 'reopen' | null

function parseTaskId(param: string | undefined): number | null {
  const id = Number(param)
  return Number.isInteger(id) && id > 0 ? id : null
}

function deadlineChanged(draft: Draft): boolean {
  const base = taskToFormValues(draft.source)
  return draft.values.date !== base.date || draft.values.time !== base.time
}

/** Тело update только из изменённых полей. */
function changedFields({ source, values }: Draft): TaskUpdateRequest {
  const body: TaskUpdateRequest = {}
  if (values.name.trim() !== source.Name) body.name = values.name.trim()
  if (values.description !== source.Description) body.description = values.description
  if (deadlineChanged({ source, values })) {
    const deadline = combineDateTime(values.date, values.time)
    if (deadline) body.deadline = toLocalRFC3339(deadline)
  }
  const minutes = parseDuration(values.duration)
  if (minutes !== source.TimeForExecution && minutes !== null) body.timeForExecution = minutes
  if (values.percent !== source.PercentOfCompleting) body.percentOfCompleting = values.percent
  if (values.groupId !== source.GroupId) body.groupId = values.groupId
  return body
}

function isDirty(draft: Draft): boolean {
  return Object.keys(changedFields(draft)).length > 0 || parseDuration(draft.values.duration) === null || !draft.values.name.trim()
}

function validate(draft: Draft, now: Date): Partial<Record<TaskField, string>> {
  return {
    name: validateTaskName(draft.values.name),
    // Дедлайн, который не меняли, может уже пройти — это не ошибка
    deadline: deadlineChanged(draft) ? validateDeadline(draft.values.date, draft.values.time, now) : undefined,
    duration: validateDuration(draft.values.duration),
  }
}

/** Экран «Задача» — design/screens/task.md. */
export function TaskPage() {
  const uid = useId()
  const navigate = useNavigate()
  const goBack = useGoBack(PARENT_PATH)
  const { showToast } = useToast()
  const now = useNow()
  const taskId = parseTaskId(useParams().taskId)

  const [draft, setDraft] = useState<Draft | null>(null)
  const dirty = draft !== null && isDirty(draft)

  const taskQuery = useTask(taskId, !dirty)
  const tasksQuery = useTasks()
  const groupsQuery = useGroups()
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()
  const createGroup = useCreateGroup()

  const [touched, setTouched] = useState<ReadonlySet<TaskField>>(new Set())
  const [serverDeadlineError, setServerDeadlineError] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending>(null)
  const [overlay, setOverlay] = useState<Overlay>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [focusRequest, setFocusRequest] = useState<number>()

  const nameRef = useRef<HTMLTextAreaElement>(null)
  const dateRef = useRef<HTMLInputElement>(null)
  const durationRef = useRef<HTMLInputElement>(null)

  const task = taskQuery.data
  // Новая серверная версия: форму без правок сбрасываем к ней, правки не трогаем
  if (task && (!draft || draft.source.TaskId !== task.TaskId || (draft.source !== task && !dirty))) {
    setDraft({ source: task, values: taskToFormValues(task) })
  }

  // Фоновое обновление не удалось, но задача уже показана из кэша — сообщаем Toast
  // 404 и 400 (id не число) — задачи нет, даже если она ещё лежит в кэше списков
  const notFound = taskId === null || (taskQuery.error instanceof ApiError && [400, 404].includes(taskQuery.error.status))
  const backgroundError = taskQuery.isError && task !== undefined && !notFound ? taskQuery.errorUpdatedAt : 0
  useEffect(() => {
    if (backgroundError) showToast({ message: 'Не удалось обновить задачу' })
  }, [backgroundError, showToast])

  useBeforeUnload(dirty)

  const requestLeave = (then: () => void) => {
    if (pending) return
    if (dirty) setOverlay({ kind: 'leave', then })
    else then()
  }

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

  const header = <PageHeader title="Задача" onBack={() => requestLeave(goBack)} />

  if (notFound) {
    return (
      <AppShell bottomNav={false}>
        {header}
        <StateMessage icon="search" title="Задача не найдена" text="Возможно, её уже удалили или ссылка устарела.">
          <Link to={PARENT_PATH} className={buttonClassName('primary')}>
            <Icon name="list" size="sm" />К списку задач
          </Link>
        </StateMessage>
      </AppShell>
    )
  }

  if (!task || !draft) {
    return (
      <AppShell bottomNav={false}>
        {header}
        {taskQuery.isError ? (
          <StateMessage
            tone="error"
            icon="alert"
            title="Не удалось загрузить задачу"
            text="Проверьте, что сервер запущен, и попробуйте ещё раз."
            detail={taskQuery.error.message}
          >
            <Button variant="secondary" onClick={() => void taskQuery.refetch()}>
              <Icon name="refresh" size="sm" />
              Повторить
            </Button>
          </StateMessage>
        ) : (
          <TaskSkeleton />
        )}
      </AppShell>
    )
  }

  const { source, values } = draft
  const done = isDone(source)
  const busy = pending !== null
  const groups = groupsQuery.data
  const errors = validate(draft, now)
  if (serverDeadlineError) errors.deadline = serverDeadlineError
  const shown = (field: TaskField) => (touched.has(field) ? errors[field] : undefined)
  const touch = (field: TaskField) => setTouched((prev) => new Set(prev).add(field))

  const update = (patch: Partial<TaskFormValues>) => setDraft({ source, values: { ...values, ...patch } })

  /** Отправка изменённых полей (+ смена статуса) одним запросом. */
  const send = async (kind: Exclude<Pending, null>, status?: TaskStatus) => {
    if (busy) return
    setTouched(new Set<TaskField>(['name', 'deadline', 'duration']))
    if (errors.name) return nameRef.current?.focus()
    if (errors.deadline) return dateRef.current?.focus()
    if (errors.duration) return durationRef.current?.focus()

    const body = changedFields(draft)
    if (status !== undefined) body.status = status
    if (Object.keys(body).length === 0) return

    setPending(kind)
    try {
      const updated = await updateTask.mutateAsync({ taskId: source.TaskId, input: body })
      setDraft({ source: updated, values: taskToFormValues(updated) })
      setTouched(new Set())
      setServerDeadlineError(null)
      if (kind === 'save') showToast({ message: 'Сохранено' })
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (error instanceof ApiError && error.status === 400 && message.includes('дедлайн')) {
        setServerDeadlineError(DEADLINE_TOO_CLOSE)
        dateRef.current?.focus()
      } else if (error instanceof ApiError && error.status === 404) {
        void taskQuery.refetch()
      } else {
        showToast({
          message: 'Не удалось сохранить изменения',
          action: { label: 'Повторить', onClick: () => void send(kind, status) },
        })
      }
    } finally {
      setPending(null)
    }
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (dirty) void send('save')
  }

  const onFormKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && dirty) {
      event.preventDefault()
      void send('save')
    }
  }

  const addGroup = async ({ name, weight }: GroupFormValues) => {
    const group = await createGroup.mutateAsync({ name, groupPriority: weight })
    update({ groupId: group.GroupId })
    setOverlay(null)
    setFocusRequest((n) => (n ?? 0) + 1)
  }

  const confirmDelete = async () => {
    setDeleteError(null)
    try {
      await deleteTask.mutateAsync(source.TaskId)
      setOverlay(null)
      goBack()
      showToast({ message: 'Задача удалена' })
    } catch (error) {
      setDeleteError(error instanceof ApiError && error.status === 0 ? 'Не удалось связаться с сервером' : error instanceof Error ? error.message : 'Неизвестная ошибка')
    }
  }

  const renderPriority = () => {
    if (done) return <PriorityCard state="done" text="Выполненные задачи не участвуют в очереди и стоят внизу своей группы." />

    // Список всех задач с актуальной версией этой задачи — для уровня и места в очереди
    const list = (tasksQuery.data ?? []).filter((t) => t.TaskId !== source.TaskId).concat(source)
    const level = priorityLevel(source.Priority, maxActivePriority(list))
    const queue = tasksQuery.data ? queuePlace(source.Priority, list, source.TaskId) : null

    let next: string | undefined
    if (dirty) {
      const deadline = combineDateTime(values.date, values.time) ?? new Date(source.DeadLine)
      const minutes = parseDuration(values.duration) ?? source.TimeForExecution
      const weight = values.groupId === source.GroupId ? source.GroupPriorty : groupWeight(values.groupId, groups)
      // Бэкенд пересчитывает Tl при каждом сохранении, для просроченной задачи Tl = 1
      const hours = Math.max(hoursUntil(deadline, now), 1)
      if (values.percent === 100) {
        next = 'После сохранения задача станет выполненной'
      } else {
        const forecast = calculatePriority({ groupWeight: weight, minutes, hours, percent: values.percent })
        const place = queuePlace(forecast, list, source.TaskId)
        next = `После сохранения ≈ ${formatPriority(forecast)} → ${placeText(place.place, place.total).replace(' активных', '')}`
      }
    }

    return (
      <PriorityCard
        state="active"
        priority={source.Priority}
        level={level}
        rank={queue ? placeText(queue.place, queue.total) : undefined}
        text="Чем ближе дедлайн и больше осталось работы, тем выше задача в списке."
        next={next}
        factors={priorityFactorRows({
          groupName: groupLabel(source.GroupId, groups),
          groupWeight: source.GroupPriorty,
          minutes: source.TimeForExecution,
          hours: source.NumberOfHoursUntilDL,
          hoursSub: `на момент расчёта, ${formatMetaDate(source.UpdatedAt, now)}`,
          percent: source.PercentOfCompleting,
        })}
      />
    )
  }

  return (
    <AppShell bottomNav={false}>
      {header}

      <form className={styles.form} noValidate onSubmit={onSubmit} onKeyDown={onFormKeyDown} aria-label="Задача">
        <TitleInput
          inputRef={nameRef}
          value={values.name}
          done={done}
          disabled={busy}
          error={shown('name')}
          onChange={(name) => update({ name })}
          onBlur={() => touch('name')}
        />

        {done ? (
          <StatusBanner completedAt={formatMetaDate(source.UpdatedAt, now)} pending={pending === 'reopen'} onReopen={() => void send('reopen', TaskStatus.Active)} />
        ) : (
          <CompleteButton pending={pending === 'complete'} disabled={busy} onClick={() => void send('complete', TaskStatus.Completed)} />
        )}

        {renderPriority()}

        <FormCard>
          <PercentSlider value={values.percent} locked={done} disabled={busy} onChange={(percent) => update({ percent })} />
        </FormCard>

        <FormCard title="Срок и объём" titleId={`${uid}-when`}>
          <DeadlineField
            date={values.date}
            time={values.time}
            now={now}
            disabled={busy}
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
            disabled={busy}
            inputRef={durationRef}
            error={shown('duration')}
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
            value={values.groupId}
            onChange={(groupId) => update({ groupId })}
            onAdd={() => setOverlay({ kind: 'group' })}
            onManage={() => requestLeave(() => navigate('/groups'))}
            disabled={busy}
            focusRequest={focusRequest}
          />
        </FormCard>

        <FormCard title={<label htmlFor={`${uid}-description`}>Описание</label>} titleId={`${uid}-description-title`}>
          <Textarea
            id={`${uid}-description`}
            rows={3}
            maxLength={TASK_DESCRIPTION_MAX}
            placeholder="Детали, ссылки, что именно сдать"
            value={values.description}
            disabled={busy}
            onChange={(e) => update({ description: e.target.value })}
          />
        </FormCard>

        <MetaNote>{`Создана ${formatMetaDate(source.CreatedAt, now)} · изменена ${formatMetaDate(source.UpdatedAt, now)}`}</MetaNote>
        <DangerZone>
          <Button
            variant="dangerGhost"
            disabled={busy}
            onClick={() => {
              setDeleteError(null)
              setOverlay({ kind: 'delete' })
            }}
          >
            <Icon name="trash" size="sm" />
            Удалить задачу
          </Button>
        </DangerZone>

        {dirty && (
          <ActionBar note="Есть несохранённые изменения" animated>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setDraft({ source, values: taskToFormValues(source) })
                setTouched(new Set())
                setServerDeadlineError(null)
              }}
            >
              Отменить
            </Button>
            <Button variant="primary" type="submit" loading={pending === 'save'} disabled={busy}>
              {pending === 'save' ? 'Сохраняем…' : 'Сохранить'}
            </Button>
          </ActionBar>
        )}
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
          Изменения в задаче пропадут.
        </ConfirmSheet>
      )}
      {overlay?.kind === 'delete' && (
        <ConfirmSheet
          title="Удалить задачу?"
          confirmLabel="Удалить"
          pendingLabel="Удаляем…"
          pending={deleteTask.isPending}
          error={deleteError}
          errorTitle="Не удалось удалить задачу"
          onCancel={() => setOverlay(null)}
          onConfirm={() => void confirmDelete()}
        >
          «{source.Name}» удалится вместе с прогрессом и пропадёт из плана на день. Отменить это нельзя.
        </ConfirmSheet>
      )}
    </AppShell>
  )
}

function TaskSkeleton() {
  return (
    <div className={styles.skeleton} aria-busy="true" aria-label="Загрузка задачи">
      <Skeleton width="80%" height={28} />
      <Skeleton height="var(--size-touch)" />
      <div className={styles.skeletonCard}>
        <Skeleton width="40%" height={16} />
        <Skeleton width="75%" height={12} />
      </div>
      <div className={styles.skeletonCard}>
        <Skeleton width="30%" height={16} />
        <Skeleton height={8} round />
      </div>
      <div className={styles.skeletonCard}>
        <Skeleton width="35%" height={16} />
        <Skeleton height="var(--size-touch)" />
        <Skeleton width={120} height="var(--size-touch)" />
      </div>
    </div>
  )
}
