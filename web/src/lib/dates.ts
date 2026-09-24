import { plural } from './format'

// Даты — в локальном часовом поясе браузера; API отдаёт и принимает RFC3339.

const MONTHS_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
]
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота']

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** Ключ локальной даты «YYYY-MM-DD». */
export function toDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** «YYYY-MM-DD» → полночь этой даты в локальном поясе; null, если строка некорректна. */
export function fromDateKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return toDateKey(date) === key ? date : null
}

export function todayKey(): string {
  return toDateKey(new Date())
}

/** Разница в календарных днях между датами (b − a). */
export function calendarDayDiff(a: Date, b: Date): number {
  const startA = new Date(a.getFullYear(), a.getMonth(), a.getDate())
  const startB = new Date(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.round((startB.getTime() - startA.getTime()) / DAY)
}

/** Полночь даты в локальном поясе в RFC3339 со смещением: «2026-09-24T00:00:00+03:00». */
export function toLocalMidnightRFC3339(key: string): string {
  const date = fromDateKey(key) ?? new Date()
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const abs = Math.abs(offset)
  const hh = String(Math.floor(abs / 60)).padStart(2, '0')
  const mm = String(abs % 60).padStart(2, '0')
  return `${toDateKey(date)}T00:00:00${sign}${hh}:${mm}`
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function timeOfDay(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/** «24 сентября» */
export function formatDayMonth(date: Date): string {
  return `${date.getDate()} ${MONTHS_GENITIVE[date.getMonth()]}`
}

export function weekdayName(date: Date): string {
  return WEEKDAYS[date.getDay()]
}

/**
 * Дата дня: «Сегодня, 24 сентября» / «Завтра, 25 сентября» / «Вчера, 23 сентября» / «Пятница, 26 сентября».
 * relative = true, если дата названа относительно сегодняшней.
 */
export function formatDayTitle(date: Date, now = new Date()): { title: string; relative: boolean } {
  const diff = calendarDayDiff(now, date)
  const relativeNames: Record<number, string> = { [-1]: 'Вчера', 0: 'Сегодня', 1: 'Завтра' }
  const name = relativeNames[diff]
  if (name) return { title: `${name}, ${formatDayMonth(date)}`, relative: true }
  const year = date.getFullYear() !== now.getFullYear() ? ` ${date.getFullYear()}` : ''
  return { title: `${capitalize(weekdayName(date))}, ${formatDayMonth(date)}${year}`, relative: false }
}

export type DeadlineTone = 'normal' | 'soon' | 'overdue'

/** Текст и тон дедлайна (DeadlineLabel). */
export function describeDeadline(deadline: string, now = new Date()): { text: string; tone: DeadlineTone } {
  const date = new Date(deadline)
  const diffMs = date.getTime() - now.getTime()

  if (diffMs < 0) {
    const late = -diffMs
    let amount: string
    if (late < HOUR) amount = `${Math.max(1, Math.floor(late / MINUTE))} мин`
    else if (late < DAY) amount = `${Math.floor(late / HOUR)} ч`
    else amount = `${Math.floor(late / DAY)} дн`
    return { text: `просрочено на ${amount}`, tone: 'overdue' }
  }

  const tone: DeadlineTone = diffMs < DAY ? 'soon' : 'normal'
  const days = calendarDayDiff(now, date)
  if (days === 0) return { text: `сегодня, ${timeOfDay(date)}`, tone }
  if (days === 1) return { text: `завтра, ${timeOfDay(date)}`, tone }
  if (days <= 6) return { text: `через ${days} ${plural(days, ['день', 'дня', 'дней'])}`, tone }
  const year = date.getFullYear() !== now.getFullYear() ? ` ${date.getFullYear()}` : ''
  return { text: `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}${year}`, tone }
}
