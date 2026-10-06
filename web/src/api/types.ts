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

/** Задача в плане дня и выделенное ей время (таблица day_tasks). */
export interface DayTask {
  DayId: number
  TaskId: number
  /** Минуты на этот день; 0 — план составлен до распределения времени («Старый план») */
  Minutes: number
}

export interface Day {
  DayId: number
  UserId: number
  /** RFC3339 */
  Date: string
  /** Минуты, которые пользователь готов отдать задачам в этот день (100% диаграммы) */
  TimeForTasks: number
  /** Снимок на сервере; экран «День» считает остаток сам по Tasks */
  PriorityOfTheDay: number
  Status: number
  UpdatedAt: string
  Tasks: Task[] | null
  /** Время каждой задачи плана; у старых версий бэкенда поля нет */
  Slots?: DayTask[] | null
}

// ---- Запросы: camelCase, как в *Request DTO ----

export interface TaskFilter {
  status?: TaskStatus
  groupId?: number
  /** RFC3339 */
  date?: string
}

export interface TaskCreateRequest {
  userId: number
  name: string
  description: string
  /** RFC3339 */
  deadline: string
  /** Минуты */
  timeForExecution: number
  /** 0–99 */
  percentOfCompleting: number
  /** 0 — без группы */
  groupId: number
}

/** Частичное обновление: передаются только изменённые поля. */
export interface TaskUpdateRequest {
  status?: TaskStatus
  name?: string
  /** RFC3339 */
  deadline?: string
  /** Минуты */
  timeForExecution?: number
  /** 0–100; 100 — задача станет выполненной */
  percentOfCompleting?: number
  description?: string
  /** 0 — убрать из группы */
  groupId?: number
}

export interface GroupCreateRequest {
  userId: number
  name: string
  /** Вес группы 1–10 */
  groupPriority: number
}

/** Частичное обновление: передаются только изменённые поля. */
export interface GroupUpdateRequest {
  name?: string
  /** Вес группы 1–10 */
  groupPriority?: number
}

export interface DayCreateRequest {
  /** RFC3339 */
  date: string
  userId: number
  /** Минуты, 15–960 */
  timeForTasks: number
}

/** Пересборка плана; без timeForTasks — с прежним временем дня. */
export interface DayUpdateRequest {
  /** Минуты, 15–960 */
  timeForTasks?: number
}

/** Атомарная смена весов нескольких групп (перенос по лесенке). */
export interface GroupReorderRequest {
  userId: number
  groups: Array<{ groupId: number; groupPriority: number }>
}

// --- Push-уведомления и напоминания (design/screens/profile.md, «Эндпоинты») ---

/** Публичный VAPID-ключ сервера, base64url. */
export interface PushKey {
  PublicKey: string
}

/** Подписка устройства, как её хранит сервер (ключи p256dh/auth в ответ не попадают). */
export interface PushSubscriptionInfo {
  SubscriptionId: number
  UserId: number
  Endpoint: string
  UserAgent: string
  CreatedAt: string
  UpdatedAt: string
}

/** Подписка устройства: subscription.toJSON() + userId и userAgent. Upsert по endpoint. */
export interface PushSubscribeRequest {
  userId: number
  endpoint: string
  keys: { p256dh: string; auth: string }
  userAgent: string
}

export interface PushUnsubscribeRequest {
  userId: number
  endpoint: string
}

/** Тестовое уведомление; без endpoint — на все устройства пользователя. */
export interface PushTestRequest {
  userId: number
  endpoint?: string
}

export interface PushTestResponse {
  Sent: number
}

/** Настройки напоминаний пользователя (одни на все устройства). Время — «ЧЧ:ММ» в Timezone. */
export interface NotificationSettings {
  UserId: number
  MorningEnabled: boolean
  MorningTime: string
  EveningEnabled: boolean
  EveningTime: string
  DeadlineEnabled: boolean
  /** 1–24 */
  DeadlineHoursBefore: number
  /** Тихие часы действуют только на «Дедлайн скоро» */
  QuietEnabled: boolean
  QuietFrom: string
  /** QuietFrom > QuietTo — интервал через полночь */
  QuietTo: string
  /** IANA, например "Europe/Moscow"; пусто — часовой пояс сервера */
  Timezone: string
  UpdatedAt: string
}

/** Частичное обновление настроек: передаются только изменённые поля. */
export interface NotificationSettingsUpdateRequest {
  morningEnabled?: boolean
  morningTime?: string
  eveningEnabled?: boolean
  eveningTime?: string
  deadlineEnabled?: boolean
  deadlineHoursBefore?: number
  quietEnabled?: boolean
  quietFrom?: string
  quietTo?: string
  timezone?: string
}
