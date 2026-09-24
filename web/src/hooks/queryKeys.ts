import { CURRENT_USER_ID } from '../api/user'

export const queryKeys = {
  tasks: ['tasks', CURRENT_USER_ID] as const,
  groups: ['groups', CURRENT_USER_ID] as const,
  days: ['days', CURRENT_USER_ID] as const,
}
