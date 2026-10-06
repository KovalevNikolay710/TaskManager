import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { Day } from '../api/types'
import { Alert } from '../components/Alert'
import { AppHeader } from '../components/AppHeader'
import { AppShell } from '../components/AppShell'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { DateSwitcher } from '../components/DateSwitcher'
import { DayChart, type ChartFocus } from '../components/DayChart'
import { Fab } from '../components/Fab'
import { Icon } from '../components/Icon'
import { PlanForm } from '../components/PlanForm'
import { QuickAddSheet } from '../components/QuickAddSheet'
import { SectionTitle } from '../components/SectionTitle'
import { Sheet } from '../components/Sheet'
import { Skeleton, SkeletonTaskRow } from '../components/Skeleton'
import { StateMessage } from '../components/StateMessage'
import { TaskRow } from '../components/TaskRow'
import { useCreateDay, useDays, useUpdateDay } from '../hooks/useDays'
import { useFlip } from '../hooks/useFlip'
import { useGroups } from '../hooks/useGroups'
import { useQuickAdd } from '../hooks/useQuickAdd'
import { useTasks } from '../hooks/useTasks'
import { useToast } from '../hooks/useToast'
import { useToggleTask } from '../hooks/useToggleTask'
import { cx } from '../lib/cx'
import { FREE_MIN_MINUTES, summarizeDay, tasksOutsidePlan, type DayPlanSummary } from '../lib/dayPlan'
import { formatDayMonth, formatDayTitle, fromDateKey, toDateKey, todayKey, toLocalMidnightRFC3339, weekdayName } from '../lib/dates'
import { formatDuration, plural } from '../lib/format'
import { PLAN_DEFAULT_MINUTES, validatePlanTime } from '../lib/plan'
import { createdTasksMessage } from '../lib/quickAdd'
import { isDone, maxActivePriority, priorityLevel } from '../lib/tasks'
import { weightClass } from '../lib/weight'
import styles from './DayPage.module.css'

const PLAN_HINT = 'От 0:15 до 16:00.'

function dayKey(day: Day): string {
  return toDateKey(new Date(day.Date))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Неизвестная ошибка'
}

function tasksWord(n: number): string {
  return `${n} ${plural(n, ['задача', 'задачи', 'задач'])}`
}

/** Экран «Задачи на день» — design/screens/day.md. */
export function DayPage() {
  const [params, setParams] = useSearchParams()
  const { showToast } = useToast()
  const daysQuery = useDays()
  const groupsQuery = useGroups()
  const tasksQuery = useTasks()

  const today = todayKey()
  const requestedKey = params.get('date')
  const selectedKey = requestedKey && fromDateKey(requestedKey) ? requestedKey : today
  const selectedDate = fromDateKey(selectedKey) ?? new Date()
  const isPast = selectedKey < today
  const isToday = selectedKey === today

  const days = daysQuery.data

  // Текущий день ищем на клиенте; если на дату несколько Day — берём с наибольшим DayId
  const latest = (list: Day[]) => list.reduce<Day | undefined>((best, d) => (!best || d.DayId > best.DayId ? d : best), undefined)
  const day = latest((days ?? []).filter((d) => dayKey(d) === selectedKey))
  // Время по умолчанию для нового плана — последнее использованное
  const lastMinutes = latest(days ?? [])?.TimeForTasks || PLAN_DEFAULT_MINUTES

  const dayKeys = [...new Set((days ?? []).map(dayKey))].sort()
  const prevKey = dayKeys.filter((k) => k < selectedKey).at(-1)
  const nextKey = dayKeys.find((k) => k > selectedKey) ?? (isPast ? today : undefined)

  const goTo = (key: string) => setParams(key === today ? {} : { date: key })

  // Sheet «Изменить план» открывается и из Toast «В план» после «Быстрой задачи»
  const [editOpen, setEditOpen] = useState(false)
  const quickAdd = useQuickAdd({
    onFinished: (created) => {
      // «В план» — только если план на выбранную дату (сегодня или будущую) уже есть
      const canPlan = Boolean(day) && !isPast
      showToast({
        message: createdTasksMessage(created.length),
        action: canPlan ? { label: 'В план', onClick: () => setEditOpen(true) } : undefined,
      })
    },
  })
  const arrowDate = (key: string | undefined) => {
    const date = key ? fromDateKey(key) : null
    return date ? `: ${formatDayMonth(date)}` : ''
  }

  const { title: dateTitle, relative } = formatDayTitle(selectedDate)
  const planTasks = day?.Tasks ?? []
  const doneCount = planTasks.filter(isDone).length

  const renderContent = () => {
    if (!days) {
      if (daysQuery.error) {
        return (
          <StateMessage
            tone="error"
            icon="alert"
            title="Не удалось загрузить план"
            text="Проверьте, что сервер запущен, и попробуйте ещё раз."
            detail={daysQuery.error.message}
          >
            <Button
              variant="secondary"
              onClick={() => {
                void daysQuery.refetch()
                void groupsQuery.refetch()
                void tasksQuery.refetch()
              }}
            >
              <Icon name="refresh" size="sm" />
              Повторить
            </Button>
          </StateMessage>
        )
      }
      return <LoadingSkeleton />
    }

    // Подсказка «не в плане» — только для сегодня и будущих дней и только если задачи загрузились
    const outside = day && !isPast && tasksQuery.data && !tasksQuery.isError ? tasksOutsidePlan(day, tasksQuery.data) : 0

    return (
      <>
        <DateSwitcher
          title={dateTitle}
          // По макету день недели показываем под «Сегодня/Вчера/Завтра»; для остальных дат он уже в заголовке
          sub={relative ? weekdayName(selectedDate) : undefined}
          badge={isPast && <Badge>Прошедший день</Badge>}
          prev={{
            label: `Предыдущий день${arrowDate(prevKey)}`,
            disabled: !prevKey,
            onClick: () => prevKey && goTo(prevKey),
          }}
          next={{
            label: `Следующий день${arrowDate(nextKey)}`,
            disabled: !nextKey,
            onClick: () => nextKey && goTo(nextKey),
          }}
        />
        {day ? (
          <DayPlan
            key={day.DayId}
            day={day}
            isPast={isPast}
            isToday={isToday}
            outside={outside}
            groupNames={groupNames(groupsQuery.data)}
            editOpen={editOpen}
            onEditOpenChange={setEditOpen}
            onNewTask={quickAdd.open}
          />
        ) : (
          <NoPlan key={selectedKey} dateKey={selectedKey} isPast={isPast} isToday={isToday} defaultMinutes={lastMinutes} />
        )}
      </>
    )
  }

  return (
    <AppShell floating={<Fab onClick={quickAdd.open} />}>
      <AppHeader
        title="Задачи на день"
        subtitle={planTasks.length > 0 ? `Выполнено ${doneCount} из ${planTasks.length}` : undefined}
        actions={
          <Button variant="primary" className={styles.newTask} aria-haspopup="dialog" aria-keyshortcuts="N" onClick={quickAdd.open}>
            <Icon name="plus" size="sm" />
            Новая задача
          </Button>
        }
      />
      {renderContent()}
      {quickAdd.sheet && <QuickAddSheet {...quickAdd.sheet} />}
    </AppShell>
  )
}

/** Подписи групп; ошибка загрузки групп не ломает экран — просто без подписей. */
function groupNames(groups: Array<{ GroupId: number; Name: string }> | undefined): Map<number, string> {
  return new Map((groups ?? []).map((g) => [g.GroupId, g.Name]))
}

// ---------- День с планом ----------

interface DayPlanProps {
  day: Day
  isPast: boolean
  isToday: boolean
  /** Активных задач не в плане */
  outside: number
  groupNames: Map<number, string>
  /** Открыт Sheet «Изменить план» */
  editOpen: boolean
  onEditOpenChange: (open: boolean) => void
  /** «Новая задача» в пустом плане — «Быстрая задача» */
  onNewTask: () => void
}

function DayPlan({ day, isPast, isToday, outside, groupNames, editOpen, onEditOpenChange, onNewTask }: DayPlanProps) {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { toggle, pendingIds } = useToggleTask()
  const updateDay = useUpdateDay()
  const listRef = useFlip<HTMLUListElement>()
  const [hovered, setHovered] = useState<ChartFocus>(null)
  const [pinned, setPinned] = useState<ChartFocus>(null)

  const summary = summarizeDay(day)
  const focus = pinned ?? hovered
  const maxPriority = maxActivePriority(summary.items.map((i) => i.task))

  /** «Пересобрать» без Sheet: ошибка — Toast. */
  const rebuild = () => {
    updateDay.mutate({ dayId: day.DayId, input: {} }, { onError: (error) => showToast({ message: errorMessage(error) }) })
  }

  const rebuildButton = !isPast && (
    <Button variant="secondary" loading={updateDay.isPending} onClick={rebuild}>
      {!updateDay.isPending && <Icon name="refresh" size="sm" />}
      {updateDay.isPending ? 'Составляем…' : 'Пересобрать'}
    </Button>
  )

  const editSheet = editOpen && <EditPlanSheet day={day} summary={summary} onClose={() => onEditOpenChange(false)} />

  if (summary.items.length === 0) {
    return (
      <>
        <StateMessage
          icon="coffee"
          compact
          title={isToday ? 'Сегодня делать нечего' : 'В этот день делать нечего'}
          text={`На ${formatDuration(day.TimeForTasks)} нет ни одной активной задачи с дедлайном позже этого дня. Добавьте задачу или хобби — и пересоберите план.`}
        >
          <div className={styles.actions}>
            <Button variant="primary" aria-haspopup="dialog" onClick={onNewTask}>
              <Icon name="plus" size="sm" />
              Новая задача
            </Button>
            {rebuildButton}
          </div>
        </StateMessage>
        {editSheet}
      </>
    )
  }

  const editButton = (
    <Button variant="ghost" onClick={() => onEditOpenChange(true)}>
      <Icon name="sliders" size="sm" />
      Изменить план
    </Button>
  )

  let note = null
  if (outside > 0) {
    note = (
      <>
        <Icon name="info" size="sm" />
        <span>Ещё {tasksWord(outside)} не в плане: не хватило времени (каждой нужно от 0:15) или они появились позже.</span>
        {editButton}
      </>
    )
  } else if (summary.freeMinutes >= FREE_MIN_MINUTES && summary.activeMinutes > 0) {
    note = (
      <>
        <Icon name="info" size="sm" />
        <span>Всё, что нужно сегодня, помещается. Свободные {formatDuration(summary.freeMinutes)} — на новое дело или отдых.</span>
      </>
    )
  }

  const listFocus = !summary.oldPlan && typeof focus === 'number'

  return (
    <>
      {summary.oldPlan ? (
        <div className={styles.oldPlan}>
          <Alert tone="info" title="План составлен по старым правилам" action={rebuildButton}>
            Пересоберите его, чтобы время разделилось между задачами.
          </Alert>
        </div>
      ) : (
        <DayChart summary={summary} groupNames={groupNames} focus={focus} onHover={setHovered} pinned={pinned} onPin={setPinned} note={note} />
      )}

      <SectionTitle title="По приоритету" action={!isPast && editButton} />

      <ul className={cx(styles.taskList, listFocus && styles.taskListFocus)} ref={listRef}>
        {summary.items.map(({ task, minutes }) => {
          const weight = task.GroupPriorty || 1
          const setFocus = (id: ChartFocus) => {
            if (!summary.oldPlan) setHovered(id)
          }
          return (
            <li
              key={task.TaskId}
              className={cx(styles.taskCard, weightClass(weight), focus === task.TaskId && styles.taskCardActive)}
              data-flip-key={task.TaskId}
              onMouseEnter={() => setFocus(task.TaskId)}
              onMouseLeave={() => setFocus(null)}
              onFocus={() => setFocus(task.TaskId)}
              onBlur={() => setFocus(null)}
            >
              <TaskRow
                task={task}
                level={priorityLevel(task.Priority, maxPriority)}
                groupName={groupNames.get(task.GroupId)}
                pending={pendingIds.has(task.TaskId)}
                slot={summary.oldPlan ? undefined : { minutes, weight }}
                onToggle={toggle}
                onOpen={(t) => navigate(`/tasks/${t.TaskId}`)}
              />
            </li>
          )
        })}
      </ul>

      {editSheet}
    </>
  )
}

// ---------- Sheet «Изменить план» ----------

function EditPlanSheet({ day, summary, onClose }: { day: Day; summary: DayPlanSummary; onClose: () => void }) {
  const formId = 'edit-plan-form'
  const updateDay = useUpdateDay()
  const [time, setTime] = useState(formatDuration(day.TimeForTasks))
  const { minutes } = validatePlanTime(time, summary.doneMinutes)
  const doneItems = summary.items.filter((i) => i.done)

  const submit = () => {
    if (minutes === null) return
    updateDay.mutate({ dayId: day.DayId, input: { timeForTasks: minutes } }, { onSuccess: onClose })
  }

  const rest = formatDuration(Math.max(0, (minutes ?? day.TimeForTasks) - summary.doneMinutes))
  const kept =
    doneItems.length === 1
      ? `«${doneItems[0].task.Name}» сохранит свои ${formatDuration(summary.doneMinutes)}.`
      : `${doneItems.length} ${plural(doneItems.length, ['выполненная задача сохранит', 'выполненные задачи сохранят', 'выполненных задач сохранят'])} свои ${formatDuration(summary.doneMinutes)}.`

  return (
    <Sheet
      title={`План на ${formatDayMonth(new Date(day.Date))}`}
      onClose={onClose}
      dismissible={!updateDay.isPending}
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={updateDay.isPending}>
            Отмена
          </Button>
          <Button variant="primary" type="submit" form={formId} loading={updateDay.isPending} disabled={minutes === null}>
            {updateDay.isPending ? 'Составляем…' : 'Пересобрать план'}
          </Button>
        </>
      }
    >
      <PlanForm id={formId} wide value={time} onChange={setTime} onSubmit={submit} hint={PLAN_HINT} doneMinutes={summary.doneMinutes}>
        {doneItems.length > 0 && (
          <Alert tone="info" title="Выполненное останется в плане">
            {kept} Остальные {rest} разделим заново между активными задачами — с учётом нового прогресса и новых задач.
          </Alert>
        )}
        {updateDay.isError && <Alert title="Не удалось пересобрать план">{errorMessage(updateDay.error)}</Alert>}
      </PlanForm>
    </Sheet>
  )
}

// ---------- Плана нет ----------

interface NoPlanProps {
  dateKey: string
  isPast: boolean
  isToday: boolean
  defaultMinutes: number
}

function NoPlan({ dateKey, isPast, isToday, defaultMinutes }: NoPlanProps) {
  const createDay = useCreateDay()
  const [time, setTime] = useState(formatDuration(defaultMinutes))
  const { minutes } = validatePlanTime(time)
  const date = fromDateKey(dateKey) ?? new Date()

  if (isPast) {
    return <StateMessage icon="sun" compact title="На этот день плана не было" />
  }

  const submit = () => {
    if (minutes === null) return
    createDay.mutate({ date: toLocalMidnightRFC3339(dateKey), timeForTasks: minutes })
  }

  return (
    <StateMessage
      icon="sun"
      compact
      title={isToday ? 'План на сегодня ещё не составлен' : `План на ${formatDayMonth(date)} ещё не составлен`}
      text={`Сколько времени готовы отдать делам ${isToday ? 'сегодня' : 'в этот день'} — вместе с хобби? Мы разделим его между задачами по приоритету.`}
    >
      <PlanForm value={time} onChange={setTime} onSubmit={submit} hint={`${PLAN_HINT} Каждой задаче достанется не меньше 0:15.`}>
        {createDay.isError && <Alert title="Не удалось составить план">{errorMessage(createDay.error)}</Alert>}
        <Button variant="primary" type="submit" className={styles.submit} loading={createDay.isPending} disabled={minutes === null}>
          {createDay.isPending ? 'Составляем…' : 'Составить план'}
        </Button>
      </PlanForm>
    </StateMessage>
  )
}

// ---------- Загрузка ----------

function LoadingSkeleton() {
  return (
    <div aria-busy="true" aria-label="Загрузка плана">
      <div className={styles.skeletonChart}>
        <Skeleton width="var(--size-day-chart)" height="var(--size-day-chart)" round />
        <div className={styles.skeletonLines}>
          <Skeleton width="70%" height={14} />
          <Skeleton width="55%" height={14} />
        </div>
      </div>
      <div className={styles.taskList}>
        {[
          ['70%', '50%'],
          ['85%', '40%'],
          ['55%', '45%'],
        ].map(([nameWidth, metaWidth], index) => (
          <div className={styles.skeletonCard} key={index}>
            <SkeletonTaskRow nameWidth={nameWidth} metaWidth={metaWidth} />
          </div>
        ))}
      </div>
    </div>
  )
}
