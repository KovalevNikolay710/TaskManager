import { useEffect, useState } from 'react'
import { ApiError } from '../api/client'
import type { Group, GroupUpdateRequest, Task } from '../api/types'
import { AppShell } from '../components/AppShell'
import { Button } from '../components/Button'
import { ConfirmSheet } from '../components/ConfirmSheet'
import { GroupLadder, type LadderEntry, type LadderMove } from '../components/GroupLadder'
import { GroupSheet, type GroupFormValues } from '../components/GroupSheet'
import { Icon } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'
import { Skeleton } from '../components/Skeleton'
import { StateMessage } from '../components/StateMessage'
import { useGoBack } from '../hooks/useGoBack'
import { useCreateGroup, useDeleteGroup, useReorderGroups, useUpdateGroup } from '../hooks/useGroupMutations'
import { useGroups } from '../hooks/useGroups'
import { useTasks } from '../hooks/useTasks'
import { useToast } from '../hooks/useToast'
import { plural } from '../lib/format'
import { planChanges, type WeightShift } from '../lib/ladder'
import { clampWeight } from '../lib/weight'
import { isDone, normalizeForSearch } from '../lib/tasks'
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

/** «„Спорт“ теперь ×3. Поднялись: Учёба ×4, Английский ×5» */
function moveText(changes: readonly WeightShift[], movedId: number, names: ReadonlyMap<number, string>): string {
  const moved = changes.find((c) => c.id === movedId)
  const others = changes.filter((c) => c.id !== movedId)
  const head = moved ? `«${names.get(movedId)}» теперь ×${moved.to}.` : ''
  const list = (items: WeightShift[]) => items.map((c) => `${names.get(c.id)} ×${c.to}`).join(', ')
  const up = others.filter((c) => c.to > c.from)
  const down = others.filter((c) => c.to < c.from)
  return [head, up.length ? `Поднялись: ${list(up)}.` : '', down.length ? `Опустились: ${list(down)}.` : ''].filter(Boolean).join(' ').replace(/\.$/, '')
}

const HIGHLIGHT_MS = 2000
const MOVE_TOAST_MS = 6000

/** Экран «Группы» — design/screens/groups.md. */
export function GroupsPage() {
  const goBack = useGoBack('/all-tasks')
  const { showToast } = useToast()
  const groupsQuery = useGroups()
  const tasksQuery = useTasks()
  const createGroup = useCreateGroup()
  const updateGroup = useUpdateGroup()
  const deleteGroup = useDeleteGroup()
  const reorderGroups = useReorderGroups()

  const [overlay, setOverlay] = useState<Overlay>(null)
  const [pendingIds, setPendingIds] = useState<ReadonlySet<number>>(new Set())
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [highlightedId, setHighlightedId] = useState<number | null>(null)

  useEffect(() => {
    if (highlightedId === null) return
    const timer = window.setTimeout(() => setHighlightedId(null), HIGHLIGHT_MS)
    return () => window.clearTimeout(timer)
  }, [highlightedId])

  const groups = groupsQuery.data
  const tasks = tasksQuery.isError ? undefined : tasksQuery.data
  const { byGroup, noGroup } = countTasks(groups ?? [], tasks)
  const countsOf = (groupId: number) => byGroup.get(groupId) ?? NO_COUNTS
  const activeCountOf = (groupId: number) => (tasks ?? []).filter((t) => t.GroupId === groupId && !isDone(t)).length

  const setPending = (groupIds: readonly number[], value: boolean) =>
    setPendingIds((prev) => {
      const next = new Set(prev)
      for (const groupId of groupIds) {
        if (value) next.add(groupId)
        else next.delete(groupId)
      }
      return next
    })

  const create = async ({ name, weight }: GroupFormValues) => {
    const group = await createGroup.mutateAsync({ name, groupPriority: weight })
    setOverlay(null)
    setHighlightedId(group.GroupId)
    showToast({ message: 'Группа создана' })
  }

  /**
   * Применяет новые веса: одна группа на ступень — POST /groups/update/:id,
   * вставка со сдвигом — POST /groups/reorder (атомарно). Группы уже на новых местах (оптимистично).
   */
  const applyWeights = async (changes: readonly WeightShift[]) => {
    const ids = changes.map((c) => c.id)
    setPending(ids, true)
    try {
      if (changes.length === 1) {
        await updateGroup.mutateAsync({ groupId: changes[0].id, input: { groupPriority: changes[0].to } })
      } else {
        await reorderGroups.mutateAsync(changes.map((c) => ({ groupId: c.id, groupPriority: c.to })))
      }
    } finally {
      setPending(ids, false)
    }
  }

  const undo = async (changes: readonly WeightShift[]) => {
    const back = changes.map((c) => ({ id: c.id, from: c.to, to: c.from }))
    try {
      await reorderGroups.mutateAsync(back.map((c) => ({ groupId: c.id, groupPriority: c.to })))
      showToast({ message: 'Перенос отменён' })
    } catch {
      showToast({ message: 'Не удалось отменить перенос', action: { label: 'Повторить', onClick: () => void undo(changes) } })
    }
  }

  const move = async (moveTo: LadderMove) => {
    const group = groups?.find((g) => g.GroupId === moveTo.groupId)
    if (!group) return
    // from — настоящий вес (у старых групп он может быть больше 10), чтобы «Отменить» вернул его
    const weightOf = (id: number) => groups?.find((g) => g.GroupId === id)?.GroupPriority ?? 1
    const changes =
      moveTo.kind === 'step'
        ? [{ id: group.GroupId, from: group.GroupPriority, to: moveTo.step }]
        : planChanges(group.GroupId, clampWeight(group.GroupPriority), moveTo.plan).map((c) => ({ ...c, from: weightOf(c.id) }))
    const real = changes.filter((c) => c.from !== c.to)
    if (real.length === 0) return
    const names = new Map((groups ?? []).map((g) => [g.GroupId, g.Name]))
    try {
      await applyWeights(real)
      showToast({
        message: moveText(real, group.GroupId, names),
        duration: MOVE_TOAST_MS,
        action: { label: 'Отменить', onClick: () => void undo(real) },
      })
    } catch {
      showToast({ message: 'Не удалось переставить группы', action: { label: 'Повторить', onClick: () => void move(moveTo) } })
    }
  }

  /** Sheet закрывается сразу, строка в состоянии pending до ответа; ошибка — Toast с повтором. */
  const save = async (group: Group, input: GroupUpdateRequest) => {
    setPending([group.GroupId], true)
    try {
      await updateGroup.mutateAsync({ groupId: group.GroupId, input })
    } catch {
      showToast({ message: 'Не удалось сохранить группу', action: { label: 'Повторить', onClick: () => void save(group, input) } })
    } finally {
      setPending([group.GroupId], false)
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
    setPending([group.GroupId], true)
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
      setPending([group.GroupId], false)
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

    if (groups.length === 0) {
      return (
        <StateMessage
          icon="folder"
          title="Групп пока нет"
          text="Группы — это области жизни: учёба, работа, дом, хобби. Их ставят на лесенку: чем выше ступень, тем важнее задачи группы."
        >
          <Button variant="primary" onClick={openCreate}>
            <Icon name="plus" size="sm" />
            Создать группу
          </Button>
        </StateMessage>
      )
    }

    const entries: LadderEntry[] = [...groups]
      .sort((a, b) => normalizeForSearch(a.Name).localeCompare(normalizeForSearch(b.Name), 'ru'))
      .map((group) => {
        const counts = countsOf(group.GroupId)
        const doneText = counts.done ? `, ${counts.done} ${plural(counts.done, ['выполнена', 'выполнены', 'выполнено'])}` : ''
        const tasksText = counts.total ? tasksWord(counts.total) : 'нет задач'
        const pending = pendingIds.has(group.GroupId)
        return {
          group,
          weight: clampWeight(group.GroupPriority),
          meta: countsText(counts),
          label: `${group.Name}, вес ${group.GroupPriority}, ${tasksText}${doneText}. ${pending ? 'Сохраняется' : 'Изменить'}`,
        }
      })
    const noGroupMeta = noGroup ? `${countsText(noGroup)} · всегда ×1` : 'всегда ×1'

    return (
      <>
        <p className={styles.intro}>
          Чем выше ступень, тем важнее задачи группы: вес ×N умножает их приоритет. Перетащите группу за{' '}
          <Icon name="grip" size="xs" className={styles.introIcon} /> на другую ступень или между двумя занятыми — группы выше сами поднимутся.
        </p>
        <GroupLadder
          entries={entries}
          noGroupMeta={noGroupMeta}
          pendingIds={pendingIds}
          locked={reorderGroups.isPending || updateGroup.isPending}
          highlightedId={highlightedId}
          onEdit={(group) => setOverlay({ kind: 'edit', groupId: group.GroupId })}
          onMove={(m) => void move(m)}
        />
        <p className={styles.footnote}>«Без группы» всегда стоит на ×1 — это точка отсчёта.</p>
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

/** Три ряда лесенки: полоса-ступень и 1–2 карточки 44px. */
const SKELETON_STEPS = [
  { tread: 48, blocks: [120] },
  { tread: 40, blocks: [100, 90] },
  { tread: 32, blocks: [110] },
]

function GroupsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Загрузка групп">
      <div className={styles.skeletonIntro}>
        <Skeleton width="90%" height={14} />
        <Skeleton width="60%" height={14} />
      </div>
      <div className={styles.skeletonLadder}>
        {SKELETON_STEPS.map(({ tread, blocks }) => (
          <div className={styles.skeletonStep} key={tread}>
            <Skeleton width={tread} height={10} />
            {blocks.map((width) => (
              <Skeleton key={width} width={width} height={44} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
