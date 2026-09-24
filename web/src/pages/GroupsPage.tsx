import { useState } from 'react'
import { ApiError } from '../api/client'
import type { Group, GroupUpdateRequest, Task } from '../api/types'
import { AppShell } from '../components/AppShell'
import { Button } from '../components/Button'
import { ConfirmSheet } from '../components/ConfirmSheet'
import { GroupList, GroupRow, StaticGroupRow } from '../components/GroupRow'
import { GroupSheet, type GroupFormValues } from '../components/GroupSheet'
import { Icon } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'
import { Skeleton } from '../components/Skeleton'
import { StateMessage } from '../components/StateMessage'
import { useFlip } from '../hooks/useFlip'
import { useGoBack } from '../hooks/useGoBack'
import { useCreateGroup, useDeleteGroup, useUpdateGroup } from '../hooks/useGroupMutations'
import { useGroups } from '../hooks/useGroups'
import { useTasks } from '../hooks/useTasks'
import { useToast } from '../hooks/useToast'
import { plural } from '../lib/format'
import { sortGroups } from '../lib/groups'
import { isDone } from '../lib/tasks'
import styles from './GroupsPage.module.css'

type Overlay = { kind: 'create' } | { kind: 'edit'; groupId: number } | { kind: 'delete'; groupId: number } | null

interface Counts {
  total: number
  done: number
}

const NO_COUNTS: Counts = { total: 0, done: 0 }

/**
 * Счётчики задач по группам. Считаем по Task.GroupId (как на «Все задачи»);
 * если список задач не загрузился — по Group.Tasks из ответа групп.
 */
function countTasks(groups: readonly Group[], tasks: readonly Task[] | undefined): { byGroup: Map<number, Counts>; noGroup: Counts | null } {
  const byGroup = new Map<number, Counts>()
  const add = (groupId: number, task: Task) => {
    const counts = byGroup.get(groupId) ?? { total: 0, done: 0 }
    byGroup.set(groupId, { total: counts.total + 1, done: counts.done + (isDone(task) ? 1 : 0) })
  }
  if (!tasks) {
    for (const group of groups) for (const task of group.Tasks ?? []) add(group.GroupId, task)
    return { byGroup, noGroup: null }
  }
  const known = new Set(groups.map((g) => g.GroupId))
  const noGroup = { total: 0, done: 0 }
  for (const task of tasks) {
    if (known.has(task.GroupId)) add(task.GroupId, task)
    else {
      noGroup.total += 1
      if (isDone(task)) noGroup.done += 1
    }
  }
  return { byGroup, noGroup }
}

function tasksWord(n: number): string {
  return `${n} ${plural(n, ['задача', 'задачи', 'задач'])}`
}

/** «4 задачи · 1 выполнена», «3 задачи», «Нет задач». */
function countsText({ total, done }: Counts): string {
  if (total === 0) return 'Нет задач'
  if (done === 0) return tasksWord(total)
  return `${tasksWord(total)} · ${done} ${plural(done, ['выполнена', 'выполнены', 'выполнено'])}`
}

function deleteText(group: Group, counts: Counts): string {
  if (counts.total === 0) return 'В группе нет задач.'
  const one = counts.total === 1
  const lower = group.GroupPriority > 1 ? `, то есть станет в ${group.GroupPriority} ${plural(group.GroupPriority, ['раз', 'раза', 'раз'])} ниже` : ''
  return one
    ? `1 задача группы не удалится — она перейдёт в «Без группы», и её приоритет пересчитается с весом ×1${lower}.`
    : `${tasksWord(counts.total)} группы не удалятся — они перейдут в «Без группы», и их приоритет пересчитается с весом ×1${lower}.`
}

function errorText(error: unknown): string {
  if (error instanceof ApiError && error.status === 0) return 'Не удалось связаться с сервером'
  return error instanceof Error ? error.message : 'Неизвестная ошибка'
}

/** Экран «Группы» — design/screens/groups.md. */
export function GroupsPage() {
  const goBack = useGoBack('/all-tasks')
  const { showToast } = useToast()
  const groupsQuery = useGroups()
  const tasksQuery = useTasks()
  const createGroup = useCreateGroup()
  const updateGroup = useUpdateGroup()
  const deleteGroup = useDeleteGroup()
  const listRef = useFlip<HTMLUListElement>()

  const [overlay, setOverlay] = useState<Overlay>(null)
  const [pendingIds, setPendingIds] = useState<ReadonlySet<number>>(new Set())
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const groups = groupsQuery.data
  const tasks = tasksQuery.isError ? undefined : tasksQuery.data
  const sorted = sortGroups(groups ?? [])
  const { byGroup, noGroup } = countTasks(groups ?? [], tasks)
  const countsOf = (groupId: number) => byGroup.get(groupId) ?? NO_COUNTS
  const activeCountOf = (groupId: number) => (tasks ?? []).filter((t) => t.GroupId === groupId && !isDone(t)).length

  const setPending = (groupId: number, value: boolean) =>
    setPendingIds((prev) => {
      const next = new Set(prev)
      if (value) next.add(groupId)
      else next.delete(groupId)
      return next
    })

  const create = async ({ name, weight }: GroupFormValues) => {
    await createGroup.mutateAsync({ name, groupPriority: weight })
    setOverlay(null)
    showToast({ message: 'Группа создана' })
  }

  /** Sheet закрывается сразу, строка в состоянии pending до ответа; ошибка — Toast с повтором. */
  const save = async (group: Group, input: GroupUpdateRequest) => {
    setPending(group.GroupId, true)
    try {
      await updateGroup.mutateAsync({ groupId: group.GroupId, input })
    } catch {
      showToast({ message: 'Не удалось сохранить группу', action: { label: 'Повторить', onClick: () => void save(group, input) } })
    } finally {
      setPending(group.GroupId, false)
    }
  }

  const edit = (group: Group) => async ({ name, weight }: GroupFormValues) => {
    const input: GroupUpdateRequest = {}
    if (name !== group.Name) input.name = name
    if (weight !== group.GroupPriority) input.groupPriority = weight
    setOverlay(null)
    void save(group, input)
  }

  const remove = async (group: Group) => {
    const moved = countsOf(group.GroupId).total
    setDeleteError(null)
    setPending(group.GroupId, true)
    try {
      await deleteGroup.mutateAsync(group.GroupId)
      setOverlay(null)
      showToast({
        message: moved
          ? `Группа удалена, ${tasksWord(moved)} ${plural(moved, ['перешла', 'перешли', 'перешли'])} в «Без группы»`
          : 'Группа удалена',
      })
    } catch (error) {
      // Группу уже удалили — строка исчезнет после обновления списка, это не ошибка
      if (error instanceof ApiError && error.status === 404) setOverlay(null)
      else setDeleteError(errorText(error))
    } finally {
      setPending(group.GroupId, false)
    }
  }

  const openCreate = () => setOverlay({ kind: 'create' })
  const current = overlay && overlay.kind !== 'create' ? groups?.find((g) => g.GroupId === overlay.groupId) : undefined

  const renderContent = () => {
    if (!groups) {
      if (groupsQuery.isError) {
        return (
          <StateMessage
            tone="error"
            icon="alert"
            title="Не удалось загрузить группы"
            text="Проверьте, что сервер запущен, и попробуйте ещё раз."
            detail={groupsQuery.error.message}
          >
            <Button
              variant="secondary"
              onClick={() => {
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
      return <GroupsSkeleton />
    }

    const noGroupCard = noGroup && noGroup.total > 0 && (
      <GroupList label="Задачи без группы">
        <li>
          <StaticGroupRow name="Без группы" meta={`${tasksWord(noGroup.total)} · вес всегда ×1`} />
        </li>
      </GroupList>
    )

    if (groups.length === 0) {
      return (
        <>
          <StateMessage
            icon="folder"
            title="Групп пока нет"
            text="Группы — это области жизни: учёба, работа, дом. У каждой свой вес, и он поднимает важные задачи выше."
          >
            <Button variant="primary" onClick={openCreate}>
              <Icon name="plus" size="sm" />
              Создать группу
            </Button>
          </StateMessage>
          {noGroupCard}
        </>
      )
    }

    return (
      <>
        <p className={styles.intro}>
          Вес группы умножает приоритет всех её задач: задача из группы ×3 при прочих равных встанет выше задачи из группы ×1.
        </p>
        <GroupList label="Группы по весу" listRef={listRef}>
          {sorted.map((group) => {
            const counts = countsOf(group.GroupId)
            const pending = pendingIds.has(group.GroupId)
            const doneText = counts.done ? `, ${counts.done} ${plural(counts.done, ['выполнена', 'выполнены', 'выполнено'])}` : ''
            const tasksText = counts.total ? tasksWord(counts.total) : 'нет задач'
            return (
              <li key={group.GroupId} data-flip-key={group.GroupId}>
                <GroupRow
                  name={group.Name}
                  weight={group.GroupPriority}
                  meta={countsText(counts)}
                  label={`${group.Name}, вес ${group.GroupPriority}, ${tasksText}${doneText}. ${pending ? 'Сохраняется' : 'Изменить'}`}
                  pending={pending}
                  onOpen={() => setOverlay({ kind: 'edit', groupId: group.GroupId })}
                />
              </li>
            )
          })}
        </GroupList>
        {noGroupCard}
      </>
    )
  }

  const showCreateAction = !groups || groups.length > 0

  return (
    <AppShell>
      <PageHeader
        title="Группы"
        backLabel="Назад к задачам"
        onBack={goBack}
        actions={
          showCreateAction && (
            <Button variant="ghost" onClick={openCreate} aria-label="Новая группа">
              <Icon name="plus" size="sm" />
              <span className={styles.actionText}>Новая группа</span>
            </Button>
          )
        }
      />
      {renderContent()}

      {overlay?.kind === 'create' && <GroupSheet mode={{ kind: 'create' }} groups={groups ?? []} onClose={() => setOverlay(null)} onSubmit={create} />}
      {overlay?.kind === 'edit' && current && (
        <GroupSheet
          mode={{ kind: 'edit', group: current, activeTaskCount: activeCountOf(current.GroupId) }}
          groups={groups ?? []}
          onClose={() => setOverlay(null)}
          onSubmit={edit(current)}
          footer={
            <Button
              variant="dangerGhost"
              onClick={() => {
                setDeleteError(null)
                setOverlay({ kind: 'delete', groupId: current.GroupId })
              }}
            >
              <Icon name="trash" size="sm" />
              Удалить группу
            </Button>
          }
        />
      )}
      {overlay?.kind === 'delete' && current && (
        <ConfirmSheet
          title={`Удалить группу «${current.Name}»?`}
          confirmLabel="Удалить группу"
          pendingLabel="Удаляем…"
          pending={deleteGroup.isPending}
          error={deleteError}
          errorTitle="Не удалось удалить группу"
          onCancel={() => setOverlay(null)}
          onConfirm={() => void remove(current)}
        >
          {deleteText(current, countsOf(current.GroupId))}
        </ConfirmSheet>
      )}
    </AppShell>
  )
}

function GroupsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Загрузка групп">
      <div className={styles.skeletonIntro}>
        <Skeleton width="90%" height={14} />
        <Skeleton width="60%" height={14} />
      </div>
      <GroupList label="Загрузка">
        {['40%', '30%', '35%'].map((width) => (
          <li key={width} className={styles.skeletonRow}>
            <Skeleton width={40} height={40} />
            <div className={styles.skeletonLines}>
              <Skeleton width={width} height={16} />
              <Skeleton width="50%" height={12} />
            </div>
          </li>
        ))}
      </GroupList>
    </div>
  )
}
