import { combineDateTime, fromDateKey } from './dates'
import { formatDuration, parseDuration, plural } from './format'
import { MIN_DEADLINE_MS } from './priority'
import { readStorage, removeStorage, writeStorage } from './storage'
import {
  TASK_NAME_MAX,
  TASK_TIME_MAX,
  TASK_TIME_MIN,
  deadlinePresets,
  defaultDeadlinePreset,
  type DeadlinePreset,
  type DeadlinePresetId,
} from './taskForm'

// «Быстрая задача» (QuickAddSheet) — design/screens/quick-add.md.

/** Параметр адреса, при котором поверх экрана открыт лист: /all-tasks?quick=1, /day?quick=1 */
export const QUICK_PARAM = 'quick'

/** Чипы времени на выполнение, минуты */
export const QUICK_TIME_PRESETS: readonly number[] = [15, 30, 60, 120]
export const QUICK_DEFAULT_MINUTES = 30

/** Подпись чипа времени: «15 мин», «30 мин», «1:00», «2:00». */
export function quickTimeLabel(minutes: number): string {
  return minutes < 60 ? `${minutes} мин` : formatDuration(minutes)
}

/** Выбранный срок: один из чипов или свой («Другое…»). */
export type QuickDeadline = { kind: 'preset'; id: DeadlinePresetId } | { kind: 'custom'; date: string; time: string }

/** Выбранное время на выполнение: один из чипов или своё значение «Ч:ММ» как его ввёл пользователь. */
export type QuickMinutes = { kind: 'preset'; minutes: number } | { kind: 'custom'; text: string }

/** Дата и время выбранного срока; для исчезнувшего чипа — null. */
export function resolveQuickDeadline(deadline: QuickDeadline, presets: readonly DeadlinePreset[]): { date: string; time: string } | null {
  if (deadline.kind === 'custom') return { date: deadline.date, time: deadline.time }
  const preset = presets.find((p) => p.id === deadline.id)
  return preset ? { date: preset.date, time: preset.time } : null
}

/** Минуты выбранного времени; null, если своё значение не распознано или вне 0:05–99:59. */
export function resolveQuickMinutes(minutes: QuickMinutes): number | null {
  if (minutes.kind === 'preset') return minutes.minutes
  const parsed = parseDuration(minutes.text)
  return parsed !== null && parsed >= TASK_TIME_MIN && parsed <= TASK_TIME_MAX ? parsed : null
}

// ---------- Черновик tm.quickAddDraft ----------

export const QUICK_DRAFT_KEY = 'tm.quickAddDraft'
/** Черновик старше суток не восстанавливается */
export const QUICK_DRAFT_TTL_MS = 24 * 3_600_000
/** Допуск на расхождение часов: черновик с savedAt позже now + 5 мин считается испорченным */
export const QUICK_DRAFT_FUTURE_SKEW_MS = 5 * 60_000

export type QuickDraftDeadline = { presetId: DeadlinePresetId } | { date: string; time: string }

export interface QuickAddDraft {
  name: string
  deadline: QuickDraftDeadline
  minutes: number
  groupId: number
  /** Момент записи, мс с эпохи */
  savedAt: number
}

/** Всё, что выбрано в листе. */
export interface QuickAddValues {
  name: string
  deadline: QuickDeadline
  minutes: QuickMinutes
  groupId: number
}

/** id группы или 0 («без группы»): целое неотрицательное, без потери точности */
function isValidId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

/** Обрезка до max единиц UTF-16 (как считает maxlength), не разрывая суррогатные пары (эмодзи). */
export function truncateText(text: string, max: number): string {
  if (text.length <= max) return text
  let result = ''
  for (const char of text) {
    if (result.length + char.length > max) break
    result += char
  }
  return result
}

const PRESET_IDS: readonly DeadlinePresetId[] = ['today', 'tomorrow', 'in3days', 'inWeek']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseDraftDeadline(value: unknown): QuickDraftDeadline | null {
  if (!isRecord(value)) return null
  if (typeof value.presetId === 'string') {
    const id = PRESET_IDS.find((p) => p === value.presetId)
    return id ? { presetId: id } : null
  }
  if (typeof value.date === 'string' && typeof value.time === 'string') return { date: value.date, time: value.time }
  return null
}

/** Разбор черновика из хранилища: null, если его нет, он повреждён или старше суток. */
export function parseQuickDraft(raw: string | null, now: Date): QuickAddDraft | null {
  if (!raw) return null
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(data)) return null
  const { name, minutes, groupId, savedAt } = data
  const deadline = parseDraftDeadline(data.deadline)
  if (typeof name !== 'string' || !name.trim() || !deadline) return null
  if (typeof minutes !== 'number' || typeof savedAt !== 'number' || !Number.isFinite(savedAt)) return null
  const age = now.getTime() - savedAt
  // Старше суток или «из будущего» (часы переводили, хранилище подменили) — не восстанавливаем
  if (age >= QUICK_DRAFT_TTL_MS || age < -QUICK_DRAFT_FUTURE_SKEW_MS) return null
  // Неверная группа не портит черновик: название важнее, задача уйдёт без группы
  const safeGroupId = isValidId(groupId) ? groupId : 0
  return { name: truncateText(name, TASK_NAME_MAX), deadline, minutes, groupId: safeGroupId, savedAt }
}

/** Черновик из выбранного в листе; минуты, которые не распознаны, заменяются значением по умолчанию. */
export function toQuickDraft(values: QuickAddValues, now: Date): QuickAddDraft {
  const { deadline } = values
  return {
    name: values.name,
    deadline: deadline.kind === 'preset' ? { presetId: deadline.id } : { date: deadline.date, time: deadline.time },
    minutes: resolveQuickMinutes(values.minutes) ?? QUICK_DEFAULT_MINUTES,
    groupId: values.groupId,
    savedAt: now.getTime(),
  }
}

export function readQuickDraft(now: Date): QuickAddDraft | null {
  return parseQuickDraft(readStorage(QUICK_DRAFT_KEY), now)
}

/** Пишет черновик, если в названии что-то есть, иначе удаляет его. */
export function saveQuickDraft(values: QuickAddValues, now: Date): void {
  if (values.name.trim()) writeStorage(QUICK_DRAFT_KEY, JSON.stringify(toQuickDraft(values, now)))
  else clearQuickDraft()
}

export function clearQuickDraft(): void {
  removeStorage(QUICK_DRAFT_KEY)
}

type PickDefault = (now: Date, presets: DeadlinePreset[]) => DeadlinePreset

/** Срок по умолчанию как выбор в листе. */
export function defaultQuickDeadline(now: Date, presets: DeadlinePreset[], pickDefault: PickDefault = defaultDeadlinePreset): QuickDeadline {
  return { kind: 'preset', id: pickDefault(now, presets).id }
}

/**
 * Начальные значения листа при открытии: черновик (если он моложе суток) или значения по умолчанию.
 * Чип черновика, которого уже нет, и свой срок ближе часа заменяются сроком по умолчанию.
 */
export function initialQuickValues(
  draft: QuickAddDraft | null,
  now: Date,
  lastGroupId: number,
  pickDefault: PickDefault = defaultDeadlinePreset,
): QuickAddValues {
  const presets = deadlinePresets(now)
  const fallback = defaultQuickDeadline(now, presets, pickDefault)
  if (!draft) return { name: '', deadline: fallback, minutes: { kind: 'preset', minutes: QUICK_DEFAULT_MINUTES }, groupId: lastGroupId }

  let deadline = fallback
  if ('presetId' in draft.deadline) {
    const { presetId } = draft.deadline
    if (presets.some((p) => p.id === presetId)) deadline = { kind: 'preset', id: presetId }
  } else {
    const at = combineDateTime(draft.deadline.date, draft.deadline.time)
    if (at && at.getTime() - now.getTime() >= MIN_DEADLINE_MS) deadline = { kind: 'custom', ...draft.deadline }
  }

  let minutes: QuickMinutes = { kind: 'preset', minutes: QUICK_DEFAULT_MINUTES }
  if (QUICK_TIME_PRESETS.includes(draft.minutes)) minutes = { kind: 'preset', minutes: draft.minutes }
  else if (Number.isInteger(draft.minutes) && draft.minutes >= TASK_TIME_MIN && draft.minutes <= TASK_TIME_MAX) {
    minutes = { kind: 'custom', text: formatDuration(draft.minutes) }
  }

  return { name: draft.name, deadline, minutes, groupId: isValidId(draft.groupId) ? draft.groupId : 0 }
}

// ---------- «Подробнее»: перенос в полную форму /tasks/new ----------

export interface NewTaskPrefill {
  name?: string
  /** «YYYY-MM-DD» */
  date?: string
  /** «HH:MM» */
  time?: string
  /** Минуты */
  minutes?: number
  /** 0 — без группы */
  groupId?: number
}

/** Query-строка для /tasks/new: name, date, time, te, groupId (пустое название не передаётся). */
export function buildNewTaskSearch(prefill: NewTaskPrefill): string {
  const params = new URLSearchParams()
  const name = prefill.name?.trim()
  if (name) params.set('name', name)
  if (prefill.date) params.set('date', prefill.date)
  if (prefill.time) params.set('time', prefill.time)
  if (prefill.minutes !== undefined) params.set('te', String(prefill.minutes))
  if (prefill.groupId !== undefined) params.set('groupId', String(prefill.groupId))
  return params.toString()
}

/** Разбор параметров /tasks/new: каждый проверяется отдельно, невалидный пропускается. */
export function parseNewTaskSearch(params: URLSearchParams): NewTaskPrefill {
  const prefill: NewTaskPrefill = {}

  const name = params.get('name')?.trim()
  if (name) prefill.name = truncateText(name, TASK_NAME_MAX)

  const date = params.get('date')
  if (date && fromDateKey(date)) prefill.date = date

  const time = params.get('time')
  const timeMatch = time ? /^(\d{2}):(\d{2})$/.exec(time) : null
  if (time && timeMatch && Number(timeMatch[1]) <= 23 && Number(timeMatch[2]) <= 59) prefill.time = time

  const te = params.get('te')
  // Без ведущих нулей и знаков: «0030», «-5», «1.5» пропускаются
  if (te && /^[1-9]\d{0,3}$/.test(te)) {
    const minutes = Number(te)
    if (minutes >= TASK_TIME_MIN && minutes <= TASK_TIME_MAX) prefill.minutes = minutes
  }

  const groupId = params.get('groupId')
  // Только целые неотрицательные id разумной длины: «1e3», «-1» и строка из сотни цифр пропускаются
  if (groupId && /^(0|[1-9]\d{0,14})$/.test(groupId) && isValidId(Number(groupId))) prefill.groupId = Number(groupId)

  return prefill
}

// ---------- Ответ сервера ----------

export type QuickAddFailure = { kind: 'deadline' } | { kind: 'alert'; title: string; text: string }

/** Текст ошибки создания задачи по статусу (0 — сеть) и тексту из {"error": "..."}. */
export function classifyQuickAddError(status: number, message: string): QuickAddFailure {
  if (status === 0) {
    return { kind: 'alert', title: 'Не удалось добавить задачу', text: 'Сервер не ответил. Всё введённое на месте — нажмите «Добавить» ещё раз.' }
  }
  // Срок успел стать ближе часа, пока лист был открыт: ErrInvalidDeadline из internal/services/errors.go
  // («неверный дедлайн: он должен быть не раньше чем через час»)
  if ((status === 400 || status === 500) && /дедлайн/i.test(message)) return { kind: 'deadline' }
  if (status === 400) return { kind: 'alert', title: 'Сервер не принял данные', text: message }
  return { kind: 'alert', title: 'Не удалось добавить задачу', text: message }
}

export const QUICK_DEADLINE_SERVER_ERROR = 'Срок уже слишком близко — выберите другой'

/** Место новой задачи в строке успеха: «5-я из 12». */
export function quickPlaceText(place: number, total: number): string {
  return `${place}-я из ${total}`
}

/** Toast после закрытия листа: «Задача создана» / «Добавлено 3 задачи». */
export function createdTasksMessage(count: number): string {
  return count === 1 ? 'Задача создана' : `Добавлено ${count} ${plural(count, ['задача', 'задачи', 'задач'])}`
}
