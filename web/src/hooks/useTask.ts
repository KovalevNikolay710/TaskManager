import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchTask } from '../api/tasks'
import type { Day, Task } from '../api/types'
import { queryKeys } from './queryKeys'

/** Задача из уже загруженных списков (все задачи или планы дней) — чтобы экран рисовался сразу. */
function findCachedTask(tasks: Task[] | undefined, days: Day[] | undefined, taskId: number): Task | undefined {
  return (
    tasks?.find((t) => t.TaskId === taskId) ??
    days?.flatMap((d) => d.Tasks ?? []).find((t) => t.TaskId === taskId)
  )
}

/**
 * Одна задача. Пока есть несохранённые правки (keepFresh = false), при возврате на вкладку
 * задача не перезапрашивается, чтобы не затереть форму.
 */
export function useTask(taskId: number | null, keepFresh: boolean) {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: queryKeys.task(taskId ?? 0),
    queryFn: () => fetchTask(taskId ?? 0),
    enabled: taskId !== null,
    initialData: () =>
      taskId === null
        ? undefined
        : findCachedTask(queryClient.getQueryData<Task[]>(queryKeys.tasks), queryClient.getQueryData<Day[]>(queryKeys.days), taskId),
    // Данные из списков считаем устаревшими: запрос обновит их в фоне
    initialDataUpdatedAt: 0,
    refetchOnWindowFocus: keepFresh,
    retry: (count, error) => count < 1 && !('status' in error && (error.status === 404 || error.status === 400)),
  })
}
