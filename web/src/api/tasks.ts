import { request } from './client'
import type { Task, TaskFilter, TaskUpdateRequest } from './types'

export function fetchUserTasks(userId: number, filter: TaskFilter = {}): Promise<Task[]> {
  return request<Task[] | null>(`/tasks/user/${userId}`, { method: 'POST', body: filter }).then((tasks) => tasks ?? [])
}

export function updateTask(taskId: number, input: TaskUpdateRequest): Promise<Task> {
  return request<Task>(`/tasks/update/${taskId}`, { method: 'POST', body: input })
}
