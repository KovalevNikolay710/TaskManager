import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Group, Task } from '../api/types'
import { AppHeader } from '../components/AppHeader'
import { AppShell } from '../components/AppShell'
import { Button } from '../components/Button'
import { buttonClassName } from '../components/buttonClassName'
import { Fab } from '../components/Fab'
import { GroupSection } from '../components/GroupSection'
import { Icon } from '../components/Icon'
import { QuickAddSheet } from '../components/QuickAddSheet'
import { SearchField } from '../components/SearchField'
import { Skeleton, SkeletonTaskRow } from '../components/Skeleton'
import { StateMessage } from '../components/StateMessage'
import { TaskRow } from '../components/TaskRow'
import { useCollapsedGroups } from '../hooks/useCollapsedGroups'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { useGroups } from '../hooks/useGroups'
import { useQuickAdd } from '../hooks/useQuickAdd'
import { useTasks } from '../hooks/useTasks'
import { useToast } from '../hooks/useToast'
import { useToggleTask } from '../hooks/useToggleTask'
import { plural } from '../lib/format'
import { clearTaskHighlight, peekTaskHighlight } from '../lib/highlight'
import { createdTasksMessage } from '../lib/quickAdd'
import { isDone, matchesQuery, maxActivePriority, normalizeForSearch, priorityLevel, sortTasks } from '../lib/tasks'
import styles from './AllTasksPage.module.css'

/** Больше стольких выполненных — сворачиваем их в строку «Выполнено: N — показать» */
const DONE_COLLAPSE_THRESHOLD = 3
const NO_GROUP_ID = 0
const HIGHLIGHT_MS = 1500

/** Подсветка новых карточек: ids — какие, scroll — прокрутить к первой из них */
interface Flash {
  ids: ReadonlySet<number>
  scroll: boolean
}

interface Section {
  id: number
  name: string
  weight?: number
  tasks: Task[]
}

/** Раскладка задач по группам: группы по GroupPriority ↓, затем по имени; «Без группы» — последней. */
function buildSections(tasks: Task[], groups: Group[]): Section[] {
  const knownGroups = new Set(groups.map((g) => g.GroupId))
  const buckets = new Map<number, Task[]>()
  for (const task of tasks) {
    const key = knownGroups.has(task.GroupId) ? task.GroupId : NO_GROUP_ID
    buckets.set(key, [...(buckets.get(key) ?? []), task])
  }

  const sections: Section[] = [...groups]
    .sort((a, b) => b.GroupPriority - a.GroupPriority || a.Name.localeCompare(b.Name, 'ru'))
    .map((g) => ({ id: g.GroupId, name: g.Name, weight: g.GroupPriority, tasks: sortTasks(buckets.get(g.GroupId) ?? []) }))
  sections.push({ id: NO_GROUP_ID, name: 'Без группы', tasks: sortTasks(buckets.get(NO_GROUP_ID) ?? []) })
  return sections.filter((s) => s.tasks.length > 0)
}

export function AllTasksPage() {
  const navigate = useNavigate()
  const tasksQuery = useTasks()
  const groupsQuery = useGroups()
  const { toggle, pendingIds } = useToggleTask()
  const { showToast } = useToast()
  // После полной формы «Новая задача»: раскрыть группу задачи, прокрутить к карточке и подсветить её
  const [highlight] = useState(peekTaskHighlight)
  const [flash, setFlash] = useState<Flash | null>(() => (highlight ? { ids: new Set([highlight.taskId]), scroll: true } : null))
  const { collapsed, toggleGroup, expandGroup } = useCollapsedGroups(highlight?.groupId)
  const [search, setSearch] = useState('')
  const [shownDone, setShownDone] = useState<ReadonlySet<number>>(new Set())

  const debouncedSearch = useDebouncedValue(search, 150).trim()
  const query = normalizeForSearch(debouncedSearch)
  const searching = query.length > 0

  const tasks = tasksQuery.data
  const groups = groupsQuery.data

  const sections = useMemo(() => (tasks && groups ? buildSections(tasks, groups) : []), [tasks, groups])
  const maxPriority = useMemo(() => maxActivePriority(tasks ?? []), [tasks])

  const flashReady = flash !== null && sections.some((s) => s.tasks.some((t) => flash.ids.has(t.TaskId)))
  useEffect(() => {
    if (!flashReady || !flash) return
    clearTaskHighlight()
    if (flash.scroll) {
      // Первая новая карточка — верхняя на экране, а не первая по порядку создания
      const cards = [...flash.ids]
        .map((id) => document.getElementById(`task-name-${id}`))
        .filter((el): el is HTMLElement => el !== null)
        .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
      cards[0]?.scrollIntoView({ block: 'center' })
    }
    const timer = window.setTimeout(() => setFlash(null), HIGHLIGHT_MS)
    return () => window.clearTimeout(timer)
  }, [flashReady, flash])

  /** Подсветить карточки заново: сначала снять класс, чтобы анимация началась с начала */
  const showCreated = (ids: number[]) => {
    setFlash(null)
    window.requestAnimationFrame(() => setFlash({ ids: new Set(ids), scroll: true }))
  }

  const knownGroupIds = useMemo(() => new Set((groups ?? []).map((g) => g.GroupId)), [groups])
  const quickAdd = useQuickAdd({
    // Новая карточка появляется под листом с подсветкой; её группу раскрываем
    onCreated: (task) => {
      expandGroup(knownGroupIds.has(task.GroupId) ? task.GroupId : NO_GROUP_ID)
      setFlash((prev) => ({ ids: new Set([...(prev?.ids ?? []), task.TaskId]), scroll: false }))
    },
    onFinished: (created) => {
      const first = created[0]
      showToast(
        created.length === 1
          ? { message: createdTasksMessage(1), action: { label: 'Открыть', onClick: () => navigate(`/tasks/${first.TaskId}`) } }
          : { message: createdTasksMessage(created.length), action: { label: 'Показать', onClick: () => showCreated(created.map((t) => t.TaskId)) } },
      )
    },
  })

  const doneCount = tasks?.filter(isDone).length ?? 0
  const activeCount = (tasks?.length ?? 0) - doneCount
  const subtitle = tasks
    ? `${activeCount} ${plural(activeCount, ['активная', 'активные', 'активных'])} · ${doneCount} выполнено`
    : undefined

  const openTask = (task: Task) => navigate(`/tasks/${task.TaskId}`)
  const toggleDone = (groupId: number) =>
    setShownDone((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })

  const renderContent = () => {
    if (!tasks || !groups) {
      const error = tasksQuery.error ?? groupsQuery.error
      if (error) {
        return (
          <StateMessage
            tone="error"
            icon="alert"
            title="Не удалось загрузить задачи"
            text="Проверьте, что сервер запущен, и попробуйте ещё раз."
            detail={error.message}
          >
            <Button
              variant="secondary"
              onClick={() => {
                void tasksQuery.refetch()
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

    if (tasks.length === 0) {
      return (
        <StateMessage
          icon="inbox"
          title="Задач пока нет"
          text="Добавьте первую задачу с дедлайном и оценкой времени — мы сами расставим приоритеты."
        >
          <Button variant="primary" aria-haspopup="dialog" onClick={quickAdd.open}>
            <Icon name="plus" size="sm" />
            Добавить задачу
          </Button>
        </StateMessage>
      )
    }

    const visibleSections = searching
      ? sections.map((s) => ({ ...s, tasks: s.tasks.filter((t) => matchesQuery(t, query)) })).filter((s) => s.tasks.length > 0)
      : sections

    return (
      <>
        <SearchField value={search} onChange={setSearch} />
        {visibleSections.length === 0 ? (
          <StateMessage
            icon="search"
            title="Ничего не найдено"
            text={`По запросу «${debouncedSearch}» задач нет. Проверьте написание или создайте такую задачу.`}
          >
            <Button variant="secondary" onClick={() => setSearch('')}>
              Сбросить поиск
            </Button>
          </StateMessage>
        ) : (
          visibleSections.map((section) => {
            const sectionDone = section.tasks.filter(isDone).length
            const hideDone = !searching && sectionDone > DONE_COLLAPSE_THRESHOLD && !shownDone.has(section.id)
            const rows = hideDone ? section.tasks.filter((t) => !isDone(t)) : section.tasks
            const showFooter = !searching && sectionDone > DONE_COLLAPSE_THRESHOLD

            return (
              <GroupSection
                key={section.id}
                name={section.name}
                weight={section.weight}
                count={searching ? `${section.tasks.length} найдено` : `${sectionDone} / ${section.tasks.length}`}
                collapsible={!searching}
                collapsed={collapsed.has(section.id)}
                onToggle={() => toggleGroup(section.id)}
                footer={
                  showFooter && (
                    <Button variant="ghost" onClick={() => toggleDone(section.id)}>
                      {hideDone ? `Выполнено: ${sectionDone} — показать` : 'Скрыть выполненные'}
                    </Button>
                  )
                }
              >
                {rows.map((task, index) => (
                  <li key={task.TaskId} data-flip-key={task.TaskId}>
                    <TaskRow
                      task={task}
                      level={priorityLevel(task.Priority, maxPriority)}
                      query={query}
                      pending={pendingIds.has(task.TaskId)}
                      divider={index > 0}
                      highlighted={flash?.ids.has(task.TaskId) ?? false}
                      onToggle={toggle}
                      onOpen={openTask}
                    />
                  </li>
                ))}
              </GroupSection>
            )
          })
        )}
      </>
    )
  }

  return (
    <AppShell floating={<Fab onClick={quickAdd.open} />}>
      <AppHeader
        title="Все задачи"
        subtitle={subtitle}
        actions={
          <>
            <Button variant="primary" className={styles.newTask} aria-haspopup="dialog" aria-keyshortcuts="N" onClick={quickAdd.open}>
              <Icon name="plus" size="sm" />
              Новая задача
            </Button>
            <Link to="/groups" className={buttonClassName('icon', styles.groups)} aria-label="Группы" title="Группы">
              <Icon name="folder" />
            </Link>
          </>
        }
      />
      {renderContent()}
      {quickAdd.sheet && <QuickAddSheet {...quickAdd.sheet} />}
    </AppShell>
  )
}

function LoadingSkeleton() {
  return (
    <div aria-busy="true" aria-label="Загрузка задач">
      <div className={styles.skeletonSearch}>
        <Skeleton height="var(--size-touch)" />
      </div>
      {[
        [
          ['70%', '45%'],
          ['85%', '40%'],
          ['55%', '50%'],
        ],
        [
          ['65%', '35%'],
          ['75%', '45%'],
        ],
      ].map((rows, groupIndex) => (
        <div className={styles.skeletonGroup} key={groupIndex}>
          <div className={styles.skeletonHeader}>
            <Skeleton width={groupIndex === 0 ? 96 : 120} height={20} />
          </div>
          <div className={styles.skeletonBody}>
            {rows.map(([nameWidth, metaWidth], rowIndex) => (
              <SkeletonTaskRow key={rowIndex} nameWidth={nameWidth} metaWidth={metaWidth} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
