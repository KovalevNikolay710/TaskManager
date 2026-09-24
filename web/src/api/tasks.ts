import { request } from './client'
import type { Task, TaskCreateRequest, TaskFilter, TaskUpdateRequest } from './types'

export function fetchUserTasks(userId: number, filter: TaskFilter = {}): Promise<Task[]> {
  return request<Task[] | null>(`/tasks/user/${userId}`, { method: 'POST', body: filter }).then((tasks) => tasks ?? [])
}

export function fetchTask(taskId: number): Promise<Task> {
  return request<Task>(`/tasks/${taskId}`)
}

export function createTask(input: TaskCreateRequest): Promise<Task> {
  return request<Task>('/tasks/', { method: 'POST', body: input })
}

export function updateTask(taskId: number, input: TaskUpdateRequest): Promise<Task> {
  return request<Task>(`/tasks/update/${taskId}`, { method: 'POST', body: input })
}

export async function deleteTask(taskId: number): Promise<void> {
  await request<unknown>(`/tasks/${taskId}`, { method: 'DELETE' })
}
