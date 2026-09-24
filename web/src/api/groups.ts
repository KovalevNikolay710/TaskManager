import { ApiError, request } from './client'
import type { Group, GroupCreateRequest, GroupUpdateRequest } from './types'

export async function fetchUserGroups(userId: number): Promise<Group[]> {
  try {
    return (await request<Group[] | null>(`/groups/user/${userId}`)) ?? []
  } catch (error) {
    // Старые версии бэкенда отвечали 404, когда групп нет, — это не ошибка
    if (error instanceof ApiError && error.status === 404) return []
    throw error
  }
}

export function createGroup(input: GroupCreateRequest): Promise<Group> {
  return request<Group>('/groups/', { method: 'POST', body: input })
}

export function updateGroup(groupId: number, input: GroupUpdateRequest): Promise<Group> {
  return request<Group>(`/groups/update/${groupId}`, { method: 'POST', body: input })
}

export async function deleteGroup(groupId: number): Promise<void> {
  await request<unknown>(`/groups/${groupId}`, { method: 'DELETE' })
}
