import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { createTask, deleteTask, updateTask } from '../api/tasks'
import type { Day, Task, TaskCreateRequest, TaskUpdateRequest } from '../api/types'
import { CURRENT_USER_ID } from '../api/user'
import { queryKeys } from './queryKeys'

/** Кладёт задачу из ответа во все кэши: список задач, планы дней и кэш самой задачи. */
export function replaceTaskInCaches(queryClient: QueryClient, updated: Task) {
  const replace = (task: Task) => (task.TaskId === updated.TaskId ? updated : task)
  queryClient.setQueryData<Task[]>(queryKeys.tasks, (tasks) => tasks?.map(replace))
  queryClient.setQueryData<Day[]>(queryKeys.days, (days) =>
    days?.map((day) => ({ ...day, Tasks: (day.Tasks ?? []).map(replace) })),
  )
  queryClient.setQueryData<Task>(queryKeys.task(updated.TaskId), updated)
}

export function useCreateTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: Omit<TaskCreateRequest, 'userId'>) => createTask({ ...input, userId: CURRENT_USER_ID }),
    // План дня пересобирается только явно, поэтому days не трогаем
    onSuccess: async (task) => {
      // Фоновый перезапрос списка, начатый до ответа, не должен затереть новую задачу
      await queryClient.cancelQueries({ queryKey: queryKeys.tasks })
      queryClient.setQueryData<Task[]>(queryKeys.tasks, (tasks) => (tasks ? [...tasks, task] : tasks))
    },
    // Сверяемся с сервером (в том числе когда кэша списка ещё не было). Не ждём: ответ мутации не задерживаем
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks })
    },
  })
}

export function useUpdateTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, input }: { taskId: number; input: TaskUpdateRequest }) => updateTask(taskId, input),
    onSuccess: (task) => replaceTaskInCaches(queryClient, task),
  })
}

export function useDeleteTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (taskId: number) => deleteTask(taskId),
    onSuccess: (_, taskId) => {
      queryClient.setQueryData<Task[]>(queryKeys.tasks, (tasks) => tasks?.filter((t) => t.TaskId !== taskId))
      queryClient.setQueryData<Day[]>(queryKeys.days, (days) =>
        days?.map((day) => ({ ...day, Tasks: (day.Tasks ?? []).filter((t) => t.TaskId !== taskId) })),
      )
      queryClient.removeQueries({ queryKey: queryKeys.task(taskId) })
    },
  })
}
