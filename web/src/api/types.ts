// Типы ответов API. Повторяют поля Go-моделей из internal/models как есть:
// у моделей нет json-тегов, поэтому имена в PascalCase (включая опечатку GroupPriorty).

export const TaskStatus = {
  Active: 1,
  Completed: 2,
} as const
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus]

export interface Task {
  TaskId: number
  UserId: number
  /** 0 — задача без группы */
  GroupId: number
  GroupPriorty: number
  /** RFC3339 */
  DeadLine: string
  /** Минуты */
  TimeForExecution: number
  Priority: number
  NumberOfHoursUntilDL: number
  PercentOfCompleting: number
  Status: TaskStatus
  Name: string
  Description: string
  CreatedAt: string
  UpdatedAt: string
}

export interface Group {
  GroupId: number
  GroupPriority: number
  UserId: number
  Name: string
  Description: string
  CreatedAt: string
  UpdatedAt: string
  Tasks: Task[] | null
}

export interface Day {
  DayId: number
  UserId: number
  /** RFC3339 */
  Date: string
  /** Минуты */
  TimeForTasks: number
  AmountOfTasks: number
  /** Снимок на сервере; экран «День» считает остаток сам по Tasks */
  PriorityOfTheDay: number
  Status: number
  UpdatedAt: string
  Tasks: Task[] | null
}

// ---- Запросы: camelCase, как в *Request DTO ----

export interface TaskFilter {
  status?: TaskStatus
  groupId?: number
  /** RFC3339 */
  date?: string
}

export interface TaskUpdateRequest {
  status?: TaskStatus
  deadline?: string
  timeForExecution?: number
  percentOfCompleting?: number
  description?: string
}

export interface DayCreateRequest {
  /** RFC3339 */
  date: string
  userId: number
  /** Минуты */
  timeForTasks: number
  amountOfTasks: number
}

export interface DayUpdateRequest {
  /** Минуты */
  timeForTasks?: number
  amountOfTasks?: number
}
