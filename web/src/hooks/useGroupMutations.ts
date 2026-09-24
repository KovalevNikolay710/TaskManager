import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createGroup, deleteGroup, updateGroup } from '../api/groups'
import type { Group, GroupCreateRequest, GroupUpdateRequest } from '../api/types'
import { CURRENT_USER_ID } from '../api/user'
import { queryKeys } from './queryKeys'

export function useCreateGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: Omit<GroupCreateRequest, 'userId'>) => createGroup({ ...input, userId: CURRENT_USER_ID }),
    onSuccess: (group) => queryClient.setQueryData<Group[]>(queryKeys.groups, (groups) => [...(groups ?? []), group]),
  })
}

export function useUpdateGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ groupId, input }: { groupId: number; input: GroupUpdateRequest }) => updateGroup(groupId, input),
    onSuccess: (group, { input }) => {
      queryClient.setQueryData<Group[]>(queryKeys.groups, (groups) => groups?.map((g) => (g.GroupId === group.GroupId ? group : g)))
      // Сервер пересчитал GroupPriorty и Priority всех задач группы
      if (input.groupPriority !== undefined) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.tasks })
        void queryClient.invalidateQueries({ queryKey: queryKeys.days })
        void queryClient.invalidateQueries({ queryKey: ['task'] })
      }
    },
  })
}

export function useDeleteGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (groupId: number) => deleteGroup(groupId),
    onSettled: () => {
      // Задачи группы перешли в «Без группы» с пересчётом приоритета
      void queryClient.invalidateQueries({ queryKey: queryKeys.groups })
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks })
      void queryClient.invalidateQueries({ queryKey: queryKeys.days })
      void queryClient.invalidateQueries({ queryKey: ['task'] })
    },
  })
}
