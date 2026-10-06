import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createDay, fetchUserDays, updateDay } from '../api/days'
import type { Day, DayCreateRequest, DayUpdateRequest } from '../api/types'
import { CURRENT_USER_ID } from '../api/user'
import { queryKeys } from './queryKeys'

export function useDays() {
  return useQuery({
    queryKey: queryKeys.days,
    queryFn: () => fetchUserDays(CURRENT_USER_ID),
  })
}

/** Кладёт день из ответа в кэш списка дней (заменяет по DayId или добавляет). */
function upsertDay(days: Day[] | undefined, day: Day): Day[] {
  const list = days ?? []
  return list.some((d) => d.DayId === day.DayId)
    ? list.map((d) => (d.DayId === day.DayId ? day : d))
    : [...list, day]
}

export function useCreateDay() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: Omit<DayCreateRequest, 'userId'>) => createDay({ ...input, userId: CURRENT_USER_ID }),
    onSuccess: (day) => queryClient.setQueryData<Day[]>(queryKeys.days, (days) => upsertDay(days, day)),
  })
}

export function useUpdateDay() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ dayId, input }: { dayId: number; input: DayUpdateRequest }) => updateDay(dayId, input),
    onSuccess: (day) => queryClient.setQueryData<Day[]>(queryKeys.days, (days) => upsertDay(days, day)),
  })
}
