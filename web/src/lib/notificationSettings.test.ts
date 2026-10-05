import { describe, expect, it } from 'vitest'
import type { NotificationSettings } from '../api/types'
import {
  QUIET_SAME_ERROR,
  applySettingsPatch,
  deadlineHoursLabel,
  isValidTime,
  needsTimezoneSync,
  normalizeTime,
  quietHoursHint,
  revertSettingsPatch,
} from './notificationSettings'

const settings: NotificationSettings = {
  UserId: 1,
  MorningEnabled: true,
  MorningTime: '08:00',
  EveningEnabled: true,
  EveningTime: '21:00',
  DeadlineEnabled: true,
  DeadlineHoursBefore: 3,
  QuietEnabled: true,
  QuietFrom: '23:00',
  QuietTo: '07:00',
  Timezone: 'Europe/Moscow',
  UpdatedAt: '2026-10-05T09:00:00Z',
}

describe('isValidTime', () => {
  it.each(['00:00', '08:00', '23:59', '12:30'])('%s — верно', (value) => {
    expect(isValidTime(value)).toBe(true)
  })

  it.each(['', '8:00', '24:00', '12:60', '12:3', '12-30', '08:00:00', ' 08:00'])('«%s» — неверно', (value) => {
    expect(isValidTime(value)).toBe(false)
  })
})

describe('normalizeTime', () => {
  it('отбрасывает секунды и пробелы', () => {
    expect(normalizeTime('08:00:00')).toBe('08:00')
    expect(normalizeTime('07:30:15.250')).toBe('07:30')
    expect(normalizeTime(' 22:00 ')).toBe('22:00')
  })

  it('пустое и мусор — null', () => {
    expect(normalizeTime('')).toBeNull()
    expect(normalizeTime('25:00')).toBeNull()
    expect(normalizeTime('abc')).toBeNull()
  })
})

describe('quietHoursHint', () => {
  it('начало позже конца — через полночь', () => {
    expect(quietHoursHint('23:00', '07:00')).toEqual({ text: 'Через полночь: до 07:00 следующего дня', error: false })
  })

  it('начало раньше конца — того же дня', () => {
    expect(quietHoursHint('13:00', '15:00')).toEqual({ text: 'С 13:00 до 15:00 того же дня', error: false })
    expect(quietHoursHint('00:00', '07:00')).toEqual({ text: 'С 00:00 до 07:00 того же дня', error: false })
  })

  it('совпадают — ошибка', () => {
    expect(quietHoursHint('22:00', '22:00')).toEqual({ text: QUIET_SAME_ERROR, error: true })
  })
})

describe('deadlineHoursLabel', () => {
  it.each([
    [1, 'за 1 час'],
    [3, 'за 3 часа'],
    [6, 'за 6 часов'],
    [12, 'за 12 часов'],
    [24, 'за 24 часа'],
  ])('%i → %s', (hours, expected) => {
    expect(deadlineHoursLabel(hours)).toBe(expected)
  })
})

describe('needsTimezoneSync', () => {
  it('пусто на сервере или другой пояс — отправить', () => {
    expect(needsTimezoneSync('', 'Europe/Moscow')).toBe(true)
    expect(needsTimezoneSync('Asia/Yekaterinburg', 'Europe/Moscow')).toBe(true)
  })

  it('совпадает или браузер пояс не знает — не отправлять', () => {
    expect(needsTimezoneSync('Europe/Moscow', 'Europe/Moscow')).toBe(false)
    expect(needsTimezoneSync('', null)).toBe(false)
  })
})

describe('applySettingsPatch / revertSettingsPatch', () => {
  it('применяет только присланные поля', () => {
    const next = applySettingsPatch(settings, { morningEnabled: false, quietFrom: '22:30' })
    expect(next).toEqual({ ...settings, MorningEnabled: false, QuietFrom: '22:30' })
    expect(settings.MorningEnabled).toBe(true)
  })

  it('откат возвращает только поля своего изменения', () => {
    const afterFirst = applySettingsPatch(settings, { morningEnabled: false })
    const afterSecond = applySettingsPatch(afterFirst, { deadlineHoursBefore: 6 })
    // первое изменение не сохранилось — второе остаётся
    expect(revertSettingsPatch(afterSecond, settings, { morningEnabled: false })).toEqual({ ...settings, DeadlineHoursBefore: 6 })
  })
})
