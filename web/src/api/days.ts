import { request } from './client'
import type { Day, DayCreateRequest, DayUpdateRequest } from './types'

/** Tasks у дня может прийти как null — приводим к массиву в одном месте. */
function normalizeDay(day: Day): Day {
  return { ...day, Tasks: day.Tasks ?? [] }
}

export async function fetchUserDays(userId: number): Promise<Day[]> {
  const days = await request<Day[] | null>(`/days/user/${userId}`)
  return (days ?? []).map(normalizeDay)
}

export async function createDay(input: DayCreateRequest): Promise<Day> {
  return normalizeDay(await request<Day>('/days/', { method: 'POST', body: input }))
}

export async function updateDay(dayId: number, input: DayUpdateRequest): Promise<Day> {
  return normalizeDay(await request<Day>(`/days/update/${dayId}`, { method: 'POST', body: input }))
}
