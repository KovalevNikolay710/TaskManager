import { useQuery } from '@tanstack/react-query'
import { fetchUserGroups } from '../api/groups'
import { CURRENT_USER_ID } from '../api/user'
import { queryKeys } from './queryKeys'

/** refetchOnMount: false — взять из кэша без перезапроса (лист «Быстрая задача» поверх экрана). */
export function useGroups({ refetchOnMount = true }: { refetchOnMount?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.groups,
    queryFn: () => fetchUserGroups(CURRENT_USER_ID),
    refetchOnMount,
  })
}
