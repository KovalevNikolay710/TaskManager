import { useQuery } from '@tanstack/react-query'
import { fetchUserGroups } from '../api/groups'
import { CURRENT_USER_ID } from '../api/user'
import { queryKeys } from './queryKeys'

export function useGroups() {
  return useQuery({
    queryKey: queryKeys.groups,
    queryFn: () => fetchUserGroups(CURRENT_USER_ID),
  })
}
