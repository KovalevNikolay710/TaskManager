import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { Day, Task } from '../api/types'
import { AppHeader } from '../components/AppHeader'
import { AppShell } from '../components/AppShell'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { buttonClassName } from '../components/buttonClassName'
import { DateSwitcher } from '../components/DateSwitcher'
import { Icon } from '../components/Icon'
import { PlanForm, type PlanFormValue } from '../components/PlanForm'
import { ProgressBar } from '../components/ProgressBar'
import { SectionTitle } from '../components/SectionTitle'
import { Sheet } from '../components/Sheet'
import { Skeleton, SkeletonTaskRow } from '../components/Skeleton'
import { StateMessage } from '../components/StateMessage'
import { SummaryStat, SummaryStats } from '../components/SummaryStat'
import { TaskRow } from '../components/TaskRow'
import { useCreateDay, useDays, useUpdateDay } from '../hooks/useDays'
import { useFlip } from '../hooks/useFlip'
import { useGroups } from '../hooks/useGroups'
import { useToast } from '../hooks/useToast'
import { useToggleTask } from '../hooks/useToggleTask'
import { formatDayMonth, formatDayTitle, fromDateKey, toDateKey, todayKey, toLocalMidnightRFC3339, weekdayName } from '../lib/dates'
import { durationToWords, formatDuration, formatPriority, plural } from '../lib/format'
import { PLAN_AMOUNT_MAX, PLAN_AMOUNT_MIN, PLAN_DEFAULTS, validatePlanTime } from '../lib/plan'
import { isDone, maxActivePriority, priorityLevel, sortTasks } from '../lib/tasks'
import styles from './DayPage.module.css'

const ALL_TASKS_PATH = '/all-tasks'

function dayKey(day: Day): string {
  return toDateKey(new Date(day.Date))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Неизвестная ошибка'
}

export function DayPage() {
  const [params, setParams] = useSearchParams()
  const daysQuery = useDays()
  const groupsQuery = useGroups()

  const today = todayKey()
  const requestedKey = params.get('date')
  const selectedKey = requestedKey && fromDateKey(requestedKey) ? requestedKey : today
  const selectedDate = fromDateKey(selectedKey) ?? new Date()
  const isPast = selectedKey < today
  const isToday = selectedKey === today

  const days = daysQuery.data

  // Текущий день ищем на клиенте; если на дату несколько Day — берём с наибольшим DayId
  const day = (days ?? [])
    .filter((d) => dayKey(d) === selectedKey)
    .reduce<Day | undefined>((best, d) => (!best || d.DayId > best.DayId ? d : best), undefined)

  const dayKeys = [...new Set((days ?? []).map(dayKey))].sort()
  const prevKey = dayKeys.filter((k) => k < selectedKey).at(-1)
  const nextKey = dayKeys.find((k) => k > selectedKey) ?? (isPast ? today : undefined)

  const goTo = (key: string) => setParams(key === today ? {} : { date: key })
  const arrowDate = (key: string | undefined) => {
    const date = key ? fromDateKey(key) : null
    return date ? `: ${formatDayMonth(date)}` : ''
  }

  const { title: dateTitle, relative } = formatDayTitle(selectedDate)
  const doneCount = day?.Tasks?.filter(isDone).length ?? 0
  const totalCount = day?.Tasks?.length ?? 0

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
          <DayPlan key={day.DayId} day={day} isPast={isPast} isToday={isToday} groupNames={groupNames(groupsQuery.data)} />
        ) : (
          <NoPlan key={selectedKey} dateKey={selectedKey} isPast={isPast} isToday={isToday} />
        )}
      </>
    )
  }

  return (
    <AppShell>
      <AppHeader title="Задачи на день" subtitle={totalCount > 0 ? `Выполнено ${doneCount} из ${totalCount}` : undefined} />
      {renderContent()}
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
  groupNames: Map<number, string>
}

function DayPlan({ day, isPast, isToday, groupNames }: DayPlanProps) {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { toggle, pendingIds } = useToggleTask()
  const updateDay = useUpdateDay()
  const listRef = useFlip<HTMLUListElement>()
  const [sheetOpen, setSheetOpen] = useState(false)

  const tasks = useMemo(() => sortTasks(day.Tasks ?? []), [day.Tasks])
  const maxPriority = maxActivePriority(tasks)
  const remainingPriority = tasks.reduce((sum, t) => (isDone(t) ? sum : sum + t.Priority), 0)
  const usedMinutes = tasks.reduce((sum, t) => sum + t.TimeForExecution, 0)
  const overMinutes = usedMinutes - day.TimeForTasks
  const over = overMinutes > 0

  const rebuild = (input: { timeForTasks?: number; amountOfTasks?: number }, onDone?: () => void) => {
    updateDay.mutate(
      { dayId: day.DayId, input },
      {
        onSuccess: () => onDone?.(),
        onError: (error) => showToast({ message: errorMessage(error) }),
      },
    )
  }

  const stats = (
    <SummaryStats>
      <SummaryStat
        value={tasks.length}
        label={`${plural(tasks.length, ['задача', 'задачи', 'задач'])} в плане`}
        note={tasks.length < day.AmountOfTasks ? `из ${day.AmountOfTasks} запрошенных` : undefined}
      />
      <SummaryStat value={formatDuration(day.TimeForTasks)} valueLabel={durationToWords(day.TimeForTasks)} label="время на задачи" />
      <SummaryStat
        value={remainingPriority > 0 ? formatPriority(remainingPriority) : '0'}
        label="приоритет дня (осталось)"
        title="Сумма приоритетов невыполненных задач плана"
      />
    </SummaryStats>
  )

  if (tasks.length === 0) {
    return (
      <>
        {stats}
        <StateMessage
          icon="coffee"
          compact
          title={isToday ? 'Сегодня делать нечего' : 'В этот день делать нечего'}
          text="Нет активных задач с дедлайном позже этого дня. Добавьте задачу — и пересоберите план."
        >
          <div className={styles.actions}>
            <Link to={ALL_TASKS_PATH} className={buttonClassName('primary')}>
              <Icon name="list" size="sm" />
              К задачам
            </Link>
            {!isPast && (
              <Button variant="secondary" loading={updateDay.isPending} onClick={() => rebuild({})}>
                {!updateDay.isPending && <Icon name="refresh" size="sm" />}
                {updateDay.isPending ? 'Составляем…' : 'Пересобрать'}
              </Button>
            )}
          </div>
        </StateMessage>
      </>
    )
  }

  return (
    <>
      {stats}
      <ProgressBar
        label="Занято времени"
        valueText={`${formatDuration(usedMinutes)} из ${formatDuration(day.TimeForTasks)}`}
        value={usedMinutes}
        max={day.TimeForTasks}
        ariaValueText={`${durationToWords(usedMinutes)} из ${durationToWords(day.TimeForTasks)}${over ? ', перегруз' : ''}`}
        overHint={
          over
            ? `План не помещается в выделенное время на ${formatDuration(overMinutes)}. Уменьшите число задач или добавьте время.`
            : undefined
        }
      />

      <SectionTitle
        title="По приоритету"
        action={
          !isPast && (
            <Button variant="ghost" onClick={() => setSheetOpen(true)}>
              <Icon name="sliders" size="sm" />
              Изменить план
            </Button>
          )
        }
      />

      <ul className={styles.taskList} ref={listRef}>
        {tasks.map((task: Task) => (
          <li key={task.TaskId} className={styles.taskCard} data-flip-key={task.TaskId}>
            <TaskRow
              task={task}
              level={priorityLevel(task.Priority, maxPriority)}
              groupName={groupNames.get(task.GroupId)}
              pending={pendingIds.has(task.TaskId)}
              onToggle={toggle}
              onOpen={(t) => navigate(`/tasks/${t.TaskId}`)}
            />
          </li>
        ))}
      </ul>

      {sheetOpen && (
        <EditPlanSheet
          day={day}
          saving={updateDay.isPending}
          onClose={() => setSheetOpen(false)}
          onSubmit={(input) => rebuild(input, () => setSheetOpen(false))}
        />
      )}
    </>
  )
}

// ---------- Sheet «Изменить план» ----------

interface EditPlanSheetProps {
  day: Day
  saving: boolean
  onClose: () => void
  onSubmit: (input: { timeForTasks: number; amountOfTasks: number }) => void
}

function EditPlanSheet({ day, saving, onClose, onSubmit }: EditPlanSheetProps) {
  const formId = 'edit-plan-form'
  const [value, setValue] = useState<PlanFormValue>({
    amount: Math.min(PLAN_AMOUNT_MAX, Math.max(PLAN_AMOUNT_MIN, day.AmountOfTasks)),
    time: formatDuration(day.TimeForTasks),
  })
  const { minutes } = validatePlanTime(value.time)

  return (
    <Sheet
      title={`План на ${formatDayMonth(new Date(day.Date))}`}
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="primary" type="submit" form={formId} loading={saving} disabled={minutes === null}>
            {saving ? 'Составляем…' : 'Пересобрать план'}
          </Button>
        </>
      }
    >
      <PlanForm
        id={formId}
        wide
        showAmountHint
        value={value}
        onChange={setValue}
        onSubmit={() => minutes !== null && onSubmit({ timeForTasks: minutes, amountOfTasks: value.amount })}
      />
    </Sheet>
  )
}

// ---------- Плана нет ----------

function NoPlan({ dateKey, isPast, isToday }: { dateKey: string; isPast: boolean; isToday: boolean }) {
  const { showToast } = useToast()
  const createDay = useCreateDay()
  const [value, setValue] = useState<PlanFormValue>({
    amount: PLAN_DEFAULTS.amount,
    time: formatDuration(PLAN_DEFAULTS.minutes),
  })
  const { minutes } = validatePlanTime(value.time)
  const date = fromDateKey(dateKey) ?? new Date()

  if (isPast) {
    return <StateMessage icon="sun" compact title="На этот день плана не было" />
  }

  const submit = () => {
    if (minutes === null) return
    createDay.mutate(
      { date: toLocalMidnightRFC3339(dateKey), timeForTasks: minutes, amountOfTasks: value.amount },
      { onError: (error) => showToast({ message: errorMessage(error) }) },
    )
  }

  return (
    <StateMessage
      icon="sun"
      compact
      title={isToday ? 'План на сегодня ещё не составлен' : `План на ${formatDayMonth(date)} ещё не составлен`}
      text="Укажите, сколько задач и времени готовы взять, — мы выберем самые приоритетные."
    >
      <PlanForm value={value} onChange={setValue} onSubmit={submit}>
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
      <SummaryStats>
        {['40%', '40%', '55%'].map((width, index) => (
          <div className={styles.skeletonStat} key={index}>
            <Skeleton width={width} height={28} />
            <Skeleton width="80%" height={12} />
          </div>
        ))}
      </SummaryStats>
      <div className={styles.skeletonProgress}>
        <Skeleton width="60%" height={14} />
        <Skeleton height={8} round />
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
