import { useQuery } from '@tanstack/react-query'
import { fetchUserTasks } from '../api/tasks'
import { CURRENT_USER_ID } from '../api/user'
import { queryKeys } from './queryKeys'

/**
 * Все задачи пользователя, любой статус.
 * refetchOnMount: false — взять из кэша без перезапроса (лист «Быстрая задача» поверх экрана).
 */
export function useTasks({ refetchOnMount = true }: { refetchOnMount?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.tasks,
    queryFn: () => fetchUserTasks(CURRENT_USER_ID),
    refetchOnMount,
  })
}
