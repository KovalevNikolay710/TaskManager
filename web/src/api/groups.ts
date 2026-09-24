import { ApiError, request } from './client'
import type { Group } from './types'

export async function fetchUserGroups(userId: number): Promise<Group[]> {
  try {
    return (await request<Group[] | null>(`/groups/user/${userId}`)) ?? []
  } catch (error) {
    // Старые версии бэкенда отвечали 404, когда групп нет, — это не ошибка
    if (error instanceof ApiError && error.status === 404) return []
    throw error
  }
}
