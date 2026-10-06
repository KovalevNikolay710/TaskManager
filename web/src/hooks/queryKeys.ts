import { CURRENT_USER_ID } from '../api/user'

export const queryKeys = {
  tasks: ['tasks', CURRENT_USER_ID] as const,
  groups: ['groups', CURRENT_USER_ID] as const,
  days: ['days', CURRENT_USER_ID] as const,
  task: (taskId: number) => ['task', taskId] as const,
  notificationSettings: ['notificationSettings', CURRENT_USER_ID] as const,
  /** Публичный VAPID-ключ сервера: меняется только вместе с ключами на сервере, кэшируется на сессию */
  pushKey: ['pushKey'] as const,
}
