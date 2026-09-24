import { useQuery } from '@tanstack/react-query'
import { fetchUserTasks } from '../api/tasks'
import { CURRENT_USER_ID } from '../api/user'
import { queryKeys } from './queryKeys'

/** Все задачи пользователя, любой статус. */
export function useTasks() {
  return useQuery({
    queryKey: queryKeys.tasks,
    queryFn: () => fetchUserTasks(CURRENT_USER_ID),
  })
}
