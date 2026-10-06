import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { updateTask } from '../api/tasks'
import { TaskStatus, type Day, type Task } from '../api/types'
import { isDone } from '../lib/tasks'
import { queryKeys } from './queryKeys'
import { useToast } from './useToast'

/**
 * Отметка задачи выполненной / возврат в работу.
 * Пока запрос идёт, задача «pending» (повторные нажатия игнорируются);
 * при успехе задача заменяется объектом из ответа во всех кэшах, при ошибке — Toast с повтором.
 */
export function useToggleTask() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const [pendingIds, setPendingIds] = useState<ReadonlySet<number>>(new Set())

  const mutation = useMutation({
    mutationFn: ({ task, done }: { task: Task; done: boolean }) =>
      updateTask(task.TaskId, done ? { percentOfCompleting: 100 } : { status: TaskStatus.Active }),
    onSuccess: (updated) => {
      const replace = (task: Task) => (task.TaskId === updated.TaskId ? updated : task)
      queryClient.setQueryData<Task[]>(queryKeys.tasks, (tasks) => tasks?.map(replace))
      queryClient.setQueryData<Day[]>(queryKeys.days, (days) =>
        days?.map((day) => ({ ...day, Tasks: (day.Tasks ?? []).map(replace) })),
      )
    },
  })
  const { mutateAsync } = mutation

  const setPending = useCallback((taskId: number, pending: boolean) => {
    setPendingIds((prev) => {
      const next = new Set(prev)
      if (pending) next.add(taskId)
      else next.delete(taskId)
      return next
    })
  }, [])

  const toggle = useCallback(
    async function run(task: Task) {
      if (pendingIds.has(task.TaskId)) return
      setPending(task.TaskId, true)
      try {
        await mutateAsync({ task, done: !isDone(task) })
      } catch {
        showToast({
          message: 'Не удалось отметить задачу',
          action: { label: 'Повторить', onClick: () => void run(task) },
        })
      } finally {
        setPending(task.TaskId, false)
      }
    },
    [mutateAsync, pendingIds, setPending, showToast],
  )

  return { toggle, pendingIds }
}
