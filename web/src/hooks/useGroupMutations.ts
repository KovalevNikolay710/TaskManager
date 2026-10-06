import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createGroup, deleteGroup, reorderGroups, updateGroup } from '../api/groups'
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
    // Новый вес показываем сразу (группа переезжает по лесенке), при ошибке возвращаем прежний
    onMutate: async ({ groupId, input }) => {
      if (input.groupPriority === undefined) return { previous: undefined }
      await queryClient.cancelQueries({ queryKey: queryKeys.groups })
      const previous = queryClient.getQueryData<Group[]>(queryKeys.groups)
      queryClient.setQueryData<Group[]>(queryKeys.groups, (groups) =>
        groups?.map((g) => (g.GroupId === groupId ? { ...g, GroupPriority: input.groupPriority ?? g.GroupPriority } : g)),
      )
      return { previous }
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.groups, context.previous)
    },
    onSuccess: (group, { input }) => {
      queryClient.setQueryData<Group[]>(queryKeys.groups, (groups) => groups?.map((g) => (g.GroupId === group.GroupId ? group : g)))
      // Сервер пересчитал GroupPriority и Priority всех задач группы
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

/** Новые веса групп: GroupId → вес. */
export type WeightChanges = ReadonlyArray<{ groupId: number; groupPriority: number }>

/**
 * Перенос по лесенке одним запросом. Оптимистично ставит группы на новые ступени;
 * при ошибке возвращает прежние веса. Ответ — все группы пользователя, кэш заменяется целиком.
 */
export function useReorderGroups() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (groups: WeightChanges) => reorderGroups({ userId: CURRENT_USER_ID, groups: [...groups] }),
    onMutate: async (groups) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.groups })
      const previous = queryClient.getQueryData<Group[]>(queryKeys.groups)
      const weights = new Map(groups.map((g) => [g.groupId, g.groupPriority]))
      queryClient.setQueryData<Group[]>(queryKeys.groups, (list) =>
        list?.map((g) => (weights.has(g.GroupId) ? { ...g, GroupPriority: weights.get(g.GroupId) ?? g.GroupPriority } : g)),
      )
      return { previous }
    },
    onError: (_error, _groups, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.groups, context.previous)
    },
    onSuccess: (groups) => {
      queryClient.setQueryData<Group[]>(queryKeys.groups, groups)
      // Сервер пересчитал GroupPriority и Priority задач затронутых групп
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks })
      void queryClient.invalidateQueries({ queryKey: queryKeys.days })
      void queryClient.invalidateQueries({ queryKey: ['task'] })
    },
  })
}
