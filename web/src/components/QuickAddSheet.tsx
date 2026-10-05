import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type SyntheticEvent } from 'react'
import { ApiError } from '../api/client'
import type { Task, TaskCreateRequest } from '../api/types'
import { queryKeys } from '../hooks/queryKeys'
import { useGroups } from '../hooks/useGroups'
import { useNow } from '../hooks/useNow'
import { useOnline } from '../hooks/useOnline'
import { useTasks } from '../hooks/useTasks'
import { cx } from '../lib/cx'
import { combineDateTime, formatShortDateTime, formatWeekdayDateTime, toLocalRFC3339 } from '../lib/dates'
import { durationToWords, formatDuration } from '../lib/format'
import { NO_GROUP_ID, shortGroupName, sortGroups } from '../lib/groups'
import { futurePlaceText } from '../lib/ordinal'
import { calculatePriority, groupWeight, hoursUntil, queuePlace } from '../lib/priority'
import {
  QUICK_DEADLINE_SERVER_ERROR,
  QUICK_TIME_PRESETS,
  buildNewTaskSearch,
  classifyQuickAddError,
  defaultQuickDeadline,
  initialQuickValues,
  quickPlaceText,
  quickTimeLabel,
  readQuickDraft,
  resolveQuickDeadline,
  resolveQuickMinutes,
  saveQuickDraft,
  type QuickAddValues,
} from '../lib/quickAdd'
import { readLastGroupId } from '../lib/storage'
import { TASK_NAME_MAX, deadlinePresets, validateDeadline, validateDuration, type DeadlinePresetId } from '../lib/taskForm'
import { maxActivePriority, priorityLevel } from '../lib/tasks'
import { weightClass } from '../lib/weight'
import { Alert } from './Alert'
import { Button } from './Button'
import { ChipRow, type ChipOption, type ChipSelectSource } from './ChipRow'
import { DeadlineField } from './DeadlineField'
import formStyles from './Form.module.css'
import { FieldHint, Input } from './FormParts'
import { GroupToggle } from './GroupToggle'
import { Icon } from './Icon'
import { Notice } from './Notice'
import { PriorityChip } from './PriorityChip'
import styles from './QuickAddSheet.module.css'
import { Sheet } from './Sheet'
import { TimeInput } from './TimeInput'

export interface QuickAddSheetProps {
  onClose: () => void
  /** Создать задачу; ошибка — ApiError (status 0 — сеть) */
  onCreate: (input: Omit<TaskCreateRequest, 'userId'>) => Promise<Task>
  /** «Подробнее»: полная форма с перенесёнными значениями (query-строка для /tasks/new) */
  onMore: (search: string) => void
  /** «Открыть» в строке успеха */
  onOpenTask: (taskId: number) => void
}

type Banner =
  | { kind: 'error'; title: string; text: string }
  | { kind: 'success'; task: Task; place: { place: number; total: number } | null; lostGroup: boolean }
  | null

const OTHER = 'other'
const DEADLINE_PRESET_TITLES: ReadonlySet<DeadlinePresetId> = new Set(['in3days', 'inWeek'])
const DRAFT_DEBOUNCE_MS = 300

/** Кнопки, нажатие на которые не должно уводить фокус из названия (иначе на телефоне закроется клавиатура). */
const keepFocus = (event: SyntheticEvent) => event.preventDefault()

/** «Быстрая задача»: название + Enter, срок, время и группа уже выбраны — design/screens/quick-add.md. */
export function QuickAddSheet({ onClose, onCreate, onMore, onOpenTask }: QuickAddSheetProps) {
  const uid = useId()
  const nameId = `${uid}-name`
  const deadlineExtraId = `${uid}-deadline`
  const deadlineHintId = `${uid}-deadline-error`
  const timeExtraId = `${uid}-time`
  const groupRowId = `${uid}-groups`

  const queryClient = useQueryClient()
  const now = useNow()
  const online = useOnline()
  // Данные берём из кэша экрана под листом; если кэша нет — запрос уйдёт сейчас
  const groupsQuery = useGroups({ refetchOnMount: false })
  const tasksQuery = useTasks({ refetchOnMount: false })
  const presets = useMemo(() => deadlinePresets(now), [now])

  const [values, setValues] = useState<QuickAddValues>(() => {
    const at = new Date()
    return initialQuickValues(readQuickDraft(at), at, readLastGroupId())
  })
  const [deadlineOpen, setDeadlineOpen] = useState(false)
  const [timeOpen, setTimeOpen] = useState(false)
  const [groupOpen, setGroupOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [banner, setBanner] = useState<Banner>(null)
  const [deadlineServerError, setDeadlineServerError] = useState(false)

  const nameRef = useRef<HTMLInputElement>(null)
  const dateRef = useRef<HTMLInputElement>(null)
  const timeRef = useRef<HTMLInputElement>(null)
  /** Куда перевести фокус после рендера: в раскрытое «Другое…» или обратно в название */
  const pendingFocus = useRef<'name' | 'date' | 'time' | null>(null)
  /** Свои значения, пока выбран чип: повторное «Другое…» вернёт их */
  const lastCustomDeadline = useRef<{ date: string; time: string } | null>(null)
  const lastCustomTime = useRef<string | null>(null)
  /** После «Подробнее» черновик не пишем: данные ушли в адрес полной формы */
  const skipDraft = useRef(false)
  const valuesRef = useRef(values)

  // Выбранный чип исчез, пока лист открыт («Сегодня, 21:00» после 20:00) — берём срок по умолчанию
  const selected = values.deadline
  if (selected.kind === 'preset' && !presets.some((p) => p.id === selected.id)) {
    setValues((prev) => ({ ...prev, deadline: defaultQuickDeadline(now, presets) }))
  }

  useEffect(() => {
    valuesRef.current = values
  })

  // Черновик: при вводе (с задержкой) и при закрытии листа
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!skipDraft.current) saveQuickDraft(values, new Date())
    }, DRAFT_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [values])
  useEffect(
    () => () => {
      if (!skipDraft.current) saveQuickDraft(valuesRef.current, new Date())
    },
    [],
  )

  useEffect(() => {
    const target = pendingFocus.current
    if (!target) return
    pendingFocus.current = null
    const ref = target === 'date' ? dateRef : target === 'time' ? timeRef : nameRef
    if (document.activeElement !== ref.current) ref.current?.focus({ preventScroll: target === 'name' })
  })

  // ---------- Группа ----------
  const groups = groupsQuery.data
  const groupsFailed = !groups && groupsQuery.isError
  // Пока группы грузятся, уйдёт tm.lastGroupId; при ошибке — «Без группы»: что видно, то и уйдёт
  let groupId = values.groupId
  if (groupsFailed || (groups && groupId !== NO_GROUP_ID && !groups.some((g) => g.GroupId === groupId))) groupId = NO_GROUP_ID
  const group = groups?.find((g) => g.GroupId === groupId) ?? null

  // ---------- Срок и время ----------
  const { deadline } = values
  const deadlineParts = resolveQuickDeadline(deadline, presets)
  const deadlineError = deadline.kind === 'custom' ? validateDeadline(deadline.date, deadline.time, now) : undefined
  const deadlineDate = deadlineParts && !deadlineError ? combineDateTime(deadlineParts.date, deadlineParts.time) : null
  const minutes = resolveQuickMinutes(values.minutes)
  const timeError = values.minutes.kind === 'custom' ? validateDuration(values.minutes.text) : undefined
  // Раскрытие видно и со свёрнутым чипом, если своё значение стало невалидным: иначе непонятно, почему «Добавить» неактивна
  const showDeadlineExtra = deadline.kind === 'custom' && (deadlineOpen || Boolean(deadlineError))
  const showTimeExtra = values.minutes.kind === 'custom' && (timeOpen || Boolean(timeError))

  const nameFilled = values.name.trim().length > 0
  const canSubmit = nameFilled && online && !submitting && deadlineDate !== null && minutes !== null

  const update = (patch: Partial<QuickAddValues>) => {
    setValues((prev) => ({ ...prev, ...patch }))
    setBanner((prev) => (prev?.kind === 'error' ? null : prev))
  }

  // Нажатие на чип оставляет (или возвращает) фокус в названии: раскрытие, где он мог быть, сворачивается.
  // «Другое…» — исключение: фокус переходит в его поле. Стрелки фокус не трогают.
  const selectDeadline = (key: string, source: ChipSelectSource) => {
    setDeadlineServerError(false)
    const click = source === 'click'
    if (key !== OTHER) {
      if (deadline.kind === 'custom') lastCustomDeadline.current = { date: deadline.date, time: deadline.time }
      update({ deadline: { kind: 'preset', id: key as DeadlinePresetId } })
      setDeadlineOpen(false)
      if (click) pendingFocus.current = 'name'
      return
    }
    // Повторное «Другое…» сворачивает раскрытие, если значение валидно
    if (deadline.kind === 'custom' && deadlineOpen && !deadlineError) {
      setDeadlineOpen(false)
      if (click) pendingFocus.current = 'name'
      return
    }
    if (deadline.kind === 'preset') {
      const start = lastCustomDeadline.current ?? deadlineParts ?? { date: '', time: '' }
      update({ deadline: { kind: 'custom', ...start } })
    }
    setDeadlineOpen(true)
    if (click) pendingFocus.current = 'date'
  }

  const selectTime = (key: string, source: ChipSelectSource) => {
    const click = source === 'click'
    if (key !== OTHER) {
      if (values.minutes.kind === 'custom') lastCustomTime.current = values.minutes.text
      update({ minutes: { kind: 'preset', minutes: Number(key) } })
      setTimeOpen(false)
      if (click) pendingFocus.current = 'name'
      return
    }
    if (values.minutes.kind === 'custom' && timeOpen && !timeError) {
      setTimeOpen(false)
      if (click) pendingFocus.current = 'name'
      return
    }
    if (values.minutes.kind === 'preset') {
      update({ minutes: { kind: 'custom', text: lastCustomTime.current ?? formatDuration(values.minutes.minutes) } })
    }
    setTimeOpen(true)
    if (click) pendingFocus.current = 'time'
  }

  // Стрелками только выбираем (ряд остаётся открытым), нажатием — выбираем и сворачиваем ряд
  const selectGroup = (key: string, source: ChipSelectSource) => {
    update({ groupId: Number(key) })
    if (source === 'arrow') return
    setGroupOpen(false)
    pendingFocus.current = 'name'
  }

  const submit = async (event?: FormEvent) => {
    event?.preventDefault()
    if (!canSubmit || !deadlineDate || minutes === null) return
    setSubmitting(true)
    setBanner((prev) => (prev?.kind === 'error' ? null : prev))
    try {
      const task = await onCreate({
        name: values.name.trim(),
        description: '',
        deadline: toLocalRFC3339(deadlineDate),
        timeForExecution: minutes,
        percentOfCompleting: 0,
        groupId,
      })
      // Кэш задач уже содержит новую (useCreateTask), место считаем среди остальных активных
      const tasks = queryClient.getQueryData<Task[]>(queryKeys.tasks)
      setBanner({
        kind: 'success',
        task,
        place: tasks ? queuePlace(task.Priority, tasks, task.TaskId) : null,
        lostGroup: groupId !== NO_GROUP_ID && task.GroupId === NO_GROUP_ID,
      })
      setDeadlineServerError(false)
      // Серия: название очищается, срок, время и группа остаются
      setValues((prev) => ({ ...prev, name: '' }))
    } catch (error) {
      const status = error instanceof ApiError ? error.status : -1
      const failure = classifyQuickAddError(status, error instanceof Error ? error.message : 'Неизвестная ошибка')
      if (failure.kind === 'deadline') {
        setDeadlineServerError(true)
        setBanner(null)
      } else {
        setBanner({ kind: 'error', title: failure.title, text: failure.text })
      }
    } finally {
      setSubmitting(false)
      nameRef.current?.focus({ preventScroll: true })
    }
  }

  const onNameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // Enter, которым подтверждают ввод в IME, задачу не создаёт
    if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault()
  }

  const more = () => {
    skipDraft.current = true
    onMore(
      buildNewTaskSearch({
        name: values.name,
        date: deadlineParts?.date || undefined,
        time: deadlineParts?.time || undefined,
        minutes: minutes ?? undefined,
        groupId,
      }),
    )
  }

  // ---------- Чипы ----------
  const deadlineOptions: ChipOption[] = [
    ...presets.map((preset) => {
      const at = combineDateTime(preset.date, preset.time)
      return {
        key: preset.id,
        label: preset.label,
        title: at && DEADLINE_PRESET_TITLES.has(preset.id) ? formatWeekdayDateTime(at) : undefined,
      }
    }),
    {
      key: OTHER,
      label: deadline.kind === 'custom' && deadlineDate ? formatShortDateTime(deadlineDate) : 'Другое…',
      expands: { expanded: showDeadlineExtra, controls: deadlineExtraId },
    },
  ]

  const timeOptions: ChipOption[] = [
    ...QUICK_TIME_PRESETS.map((m) => ({ key: String(m), label: quickTimeLabel(m), ariaLabel: durationToWords(m) })),
    {
      key: OTHER,
      label: values.minutes.kind === 'custom' && minutes !== null ? formatDuration(minutes) : 'Другое…',
      expands: { expanded: showTimeExtra, controls: timeExtraId },
    },
  ]

  const groupOptions: ChipOption[] = [
    ...sortGroups(groups ?? []).map((g) => ({
      key: String(g.GroupId),
      label: (
        <>
          <span className={formStyles.chipDot} aria-hidden="true" />
          {shortGroupName(g.Name)}
          <span className={formStyles.chipWeight} aria-hidden="true">
            ×{g.GroupPriority}
          </span>
        </>
      ),
      ariaLabel: `${g.Name}, вес ${g.GroupPriority}`,
      title: g.Name !== shortGroupName(g.Name) ? g.Name : undefined,
      className: cx(formStyles.chipWeighted, weightClass(g.GroupPriority)),
    })),
    {
      key: String(NO_GROUP_ID),
      label: (
        <>
          <span className={cx(formStyles.chipDot, formStyles.chipDotBase)} aria-hidden="true" />
          Без группы
        </>
      ),
      ariaLabel: 'Без группы',
      // «Без группы» = вес 1, но точка нейтральная — как в GroupPicker
      className: cx(formStyles.chipWeighted, weightClass(1)),
    },
  ]

  // ---------- Предпросмотр ----------
  const renderPreview = () => {
    if (!deadlineDate || minutes === null) return <span>Укажите срок и время — покажем место в очереди</span>
    const priority = calculatePriority({ groupWeight: groupWeight(groupId, groups), minutes, hours: hoursUntil(deadlineDate, now), percent: 0 })
    const tasks = tasksQuery.data
    const queue = tasks ? queuePlace(priority, tasks) : null
    const level = priorityLevel(priority, Math.max(maxActivePriority(tasks ?? []), priority))
    return (
      <>
        <PriorityChip priority={priority} level={level} />
        {queue && <span>{futurePlaceText(queue.place, queue.total)}</span>}
      </>
    )
  }

  // ---------- Плашка: офлайн > ошибка > успех ----------
  const renderBanner = () => {
    if (!online) {
      return (
        <Notice icon="wifiOff" title="Нет сети." className={styles.banner}>
          Добавить задачу получится, когда связь вернётся. Текст не пропадёт.
        </Notice>
      )
    }
    if (banner?.kind === 'error') {
      return (
        <div className={styles.banner}>
          {/* Фокус не забираем: иначе на телефоне закроется клавиатура; role="alert" объявит сам */}
          <Alert title={banner.title} autoFocus={false}>
            {banner.text}
          </Alert>
        </div>
      )
    }
    if (banner?.kind === 'success') {
      const { task, place, lostGroup } = banner
      return (
        <div className={styles.status} role="status">
          <Icon name="checkCircle" size="sm" className={styles.statusIcon} />
          <span className={styles.statusText}>
            <b>{place ? quickPlaceText(place.place, place.total) : 'Добавлена'}</b> — «{task.Name}»
            {lostGroup && ' — создана без группы: группа не найдена'}
          </span>
          <Button variant="ghost" className={styles.statusAction} onClick={() => onOpenTask(task.TaskId)}>
            Открыть
          </Button>
        </div>
      )
    }
    return null
  }

  return (
    <Sheet
      title="Новая задача"
      variant="quick"
      onClose={onClose}
      headActions={
        <Button variant="ghost" className={styles.more} disabled={submitting} onClick={more}>
          Подробнее
          <Icon name="arrowRight" size="sm" />
        </Button>
      }
    >
      {renderBanner()}

      <form className={styles.form} noValidate aria-label="Новая задача" onSubmit={(e) => void submit(e)}>
        <label className="visually-hidden" htmlFor={nameId}>
          Название задачи
        </label>
        <Input
          ref={nameRef}
          id={nameId}
          className={styles.name}
          type="text"
          data-autofocus
          maxLength={TASK_NAME_MAX}
          autoComplete="off"
          autoCapitalize="sentences"
          enterKeyHint="send"
          placeholder="Что нужно сделать?"
          value={values.name}
          // readOnly, а не disabled: disabled снимает фокус и закрывает клавиатуру
          readOnly={submitting}
          onChange={(e) => update({ name: e.target.value })}
          onKeyDown={onNameKeyDown}
        />

        <ChipRow
          label="Дедлайн"
          icon="flag"
          options={deadlineOptions}
          value={deadline.kind === 'preset' ? deadline.id : OTHER}
          onSelect={selectDeadline}
          disabled={submitting}
          invalid={deadlineServerError}
          describedBy={deadlineServerError ? deadlineHintId : undefined}
        />
        {deadlineServerError && (
          <div className={styles.extra}>
            <FieldHint id={deadlineHintId} tone="error">
              {QUICK_DEADLINE_SERVER_ERROR}
            </FieldHint>
          </div>
        )}
        {showDeadlineExtra && deadline.kind === 'custom' && (
          <div className={cx(styles.extra, styles.deadlineExtra)} id={deadlineExtraId}>
            <DeadlineField
              date={deadline.date}
              time={deadline.time}
              now={now}
              legendHidden
              dateRef={dateRef}
              error={deadlineError}
              onChange={(date, time) => {
                setDeadlineServerError(false)
                update({ deadline: { kind: 'custom', date, time } })
              }}
            />
          </div>
        )}

        <ChipRow
          label="Время на выполнение"
          icon="clock"
          options={timeOptions}
          value={values.minutes.kind === 'preset' ? String(values.minutes.minutes) : OTHER}
          onSelect={selectTime}
          disabled={submitting}
        />
        {showTimeExtra && values.minutes.kind === 'custom' && (
          <div className={styles.extra} id={timeExtraId}>
            <TimeInput
              label="Время на выполнение"
              labelHidden
              value={values.minutes.text}
              inputRef={timeRef}
              error={timeError}
              hint="От 0:05 до 99:59, например 1:30"
              onChange={(text) => update({ minutes: { kind: 'custom', text } })}
            />
          </div>
        )}

        {groupOpen && (
          <>
            <ChipRow
              id={groupRowId}
              label="Группа"
              icon="folder"
              options={groupsFailed ? groupOptions.slice(-1) : groupOptions}
              value={String(groupId)}
              disabled={submitting}
              onSelect={selectGroup}
            />
            {groupsFailed && (
              <div className={styles.extra}>
                <FieldHint tone="error">
                  Не удалось загрузить группы{' '}
                  <Button variant="ghost" onPointerDown={keepFocus} onMouseDown={keepFocus} onClick={() => void groupsQuery.refetch()}>
                    Повторить
                  </Button>
                </FieldHint>
              </div>
            )}
          </>
        )}

        <p className={styles.preview} aria-live="polite">
          {renderPreview()}
          <span className={styles.kbdHint}>
            · <kbd className={styles.kbd}>Enter</kbd> добавить · <kbd className={styles.kbd}>Esc</kbd> закрыть
          </span>
        </p>

        <div className={styles.foot}>
          <GroupToggle
            group={group}
            loading={!groups && !groupsQuery.isError}
            expanded={groupOpen}
            controls={groupRowId}
            disabled={submitting}
            onToggle={() => setGroupOpen((open) => !open)}
          />
          <Button
            variant="primary"
            type="submit"
            className={styles.submit}
            loading={submitting}
            disabled={!canSubmit}
            onPointerDown={keepFocus}
            onMouseDown={keepFocus}
          >
            {submitting ? 'Добавляем…' : 'Добавить'}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}
