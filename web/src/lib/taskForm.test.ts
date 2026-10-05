import { describe, expect, it } from 'vitest'
import {
  DEADLINE_TOO_CLOSE, TASK_TIME_MAX, TASK_TIME_MIN, deadlinePresets, defaultDeadlinePreset, durationWarning, validateDeadline, validateDuration,
} from './taskForm'
import { formatDuration } from './format'

const now = new Date('2026-10-05T20:30:00')

describe('validateDeadline', () => {
  it('просит заполнить обе части', () => {
    expect(validateDeadline('', '', now)).toBe('Укажите дату и время дедлайна')
    expect(validateDeadline('2026-10-06', '', now)).toBe('Укажите дату и время дедлайна')
    expect(validateDeadline('', '10:00', now)).toBe('Укажите дату и время дедлайна')
  })

  it('отклоняет некорректную дату', () => {
    expect(validateDeadline('2026-02-31', '10:00', now)).toBe('Укажите дату и время дедлайна')
  })

  it('прошедший дедлайн', () => {
    expect(validateDeadline('2026-10-05', '19:00', now)).toMatch(/уже прошёл/)
  })

  it('дедлайн ровно сейчас считается прошедшим', () => {
    expect(validateDeadline('2026-10-05', '20:30', now)).toMatch(/уже прошёл/)
  })

  it('менее часа - слишком близко', () => {
    expect(validateDeadline('2026-10-05', '21:29', now)).toBe(DEADLINE_TOO_CLOSE)
  })

  it('ровно через час допустим (граница)', () => {
    expect(validateDeadline('2026-10-05', '21:30', now)).toBeUndefined()
  })

  it('далёкий дедлайн допустим', () => {
    expect(validateDeadline('2026-12-31', '23:59', now)).toBeUndefined()
  })
})

describe('validateDuration', () => {
  it('принимает границы', () => {
    expect(validateDuration(formatDuration(TASK_TIME_MIN))).toBeUndefined()
    expect(validateDuration(formatDuration(TASK_TIME_MAX))).toBeUndefined()
  })

  it('нераспознанный ввод', () => {
    expect(validateDuration('')).toMatch(/формате ч:мм/)
    expect(validateDuration('abc')).toMatch(/формате ч:мм/)
  })

  it('меньше минимума', () => {
    expect(validateDuration('0:04')).toBe('Минимум 0:05')
    expect(validateDuration('0:00')).toBe('Минимум 0:05')
  })

  it('значения выше 99:59 парсер не пропускает: срабатывает ошибка формата', () => {
    // Ветка «Не больше 99:59» недостижима: parseDuration даёт максимум 99:59 (см. отчёт)
    expect(validateDuration('100:00')).toMatch(/формате ч:мм/)
    expect(validateDuration('99999')).toMatch(/формате ч:мм/)
  })
})

describe('durationWarning', () => {
  it('предупреждает, когда работы больше, чем времени до дедлайна', () => {
    expect(durationWarning('2026-10-05', '22:30', '3:00', now)).toBe(
      'До дедлайна 2 ч, а задача займёт 3:00 — может не хватить времени',
    )
  })

  it('без предупреждения, если времени хватает или поровну', () => {
    expect(durationWarning('2026-10-05', '22:30', '2:00', now)).toBeUndefined()
    expect(durationWarning('2026-10-05', '22:30', '1:00', now)).toBeUndefined()
  })

  it('без предупреждения при пустых или битых полях', () => {
    expect(durationWarning('', '', '3:00', now)).toBeUndefined()
    expect(durationWarning('2026-10-06', '10:00', 'xx', now)).toBeUndefined()
  })

  it('без предупреждения для прошедшего дедлайна (это ловит validateDeadline)', () => {
    expect(durationWarning('2026-10-05', '10:00', '3:00', now)).toBeUndefined()
  })
})

describe('deadlinePresets', () => {
  it('до 20:00 есть «Сегодня, 21:00»', () => {
    const presets = deadlinePresets(new Date('2026-10-05T12:00:00'))
    expect(presets.map((p) => p.label)).toEqual(['Сегодня, 21:00', 'Завтра, 18:00', 'Через 3 дня', 'Через неделю'])
    expect(presets.map((p) => p.id)).toEqual(['today', 'tomorrow', 'in3days', 'inWeek'])
    expect(presets[0]).toMatchObject({ date: '2026-10-05', time: '21:00' })
  })

  it('после 20:00 «Сегодня» нет; даты считаются от now', () => {
    const presets = deadlinePresets(now)
    expect(presets).toEqual([
      { id: 'tomorrow', label: 'Завтра, 18:00', date: '2026-10-06', time: '18:00' },
      { id: 'in3days', label: 'Через 3 дня', date: '2026-10-08', time: '18:00' },
      { id: 'inWeek', label: 'Через неделю', date: '2026-10-12', time: '18:00' },
    ])
  })

  it('граница 20:00: «Сегодня» уже не предлагается', () => {
    expect(deadlinePresets(new Date('2026-10-05T20:00:00'))).toHaveLength(3)
    expect(deadlinePresets(new Date('2026-10-05T19:59:00'))).toHaveLength(4)
  })

  it('переход через границу месяца и года', () => {
    const presets = deadlinePresets(new Date('2026-12-30T22:00:00'))
    expect(presets.map((p) => p.date)).toEqual(['2026-12-31', '2027-01-02', '2027-01-06'])
  })

  it('все предложенные дедлайны проходят validateDeadline', () => {
    for (const p of deadlinePresets(new Date('2026-10-05T19:00:00'))) {
      expect(validateDeadline(p.date, p.time, new Date('2026-10-05T19:00:00'))).toBeUndefined()
    }
  })
})

describe('defaultDeadlinePreset', () => {
  const at = (time: string) => new Date(`2026-10-05T${time}:00`)
  const pick = (time: string) => {
    const presets = deadlinePresets(at(time))
    return { presets, result: defaultDeadlinePreset(at(time), presets) }
  }

  it.each(['00:00', '03:30', '04:59'])('ночью (%s) - «Сегодня»', (time) => {
    const { presets, result } = pick(time)
    expect(result.id).toBe('today')
    expect(result).toBe(presets.find((p) => p.id === 'today'))
  })

  it.each(['05:00', '12:00', '19:59'])('днём и вечером (%s) - «Завтра»', (time) => {
    const { presets, result } = pick(time)
    expect(result.id).toBe('tomorrow')
    expect(result).toBe(presets.find((p) => p.id === 'tomorrow'))
  })

  it.each(['20:00', '23:59'])('после 20:00 (%s) чипа «Сегодня» нет, выбирается «Завтра»', (time) => {
    const { presets, result } = pick(time)
    expect(presets.some((p) => p.id === 'today')).toBe(false)
    expect(result.id).toBe('tomorrow')
    expect(result).toBe(presets.find((p) => p.id === 'tomorrow'))
  })

  it('результат всегда элемент presets для каждого часа', () => {
    for (let hour = 0; hour < 24; hour++) {
      const { presets, result } = pick(`${String(hour).padStart(2, '0')}:15`)
      expect(presets.includes(result)).toBe(true)
    }
  })

  it('ночью без «Сегодня» - «Завтра»', () => {
    const presets = deadlinePresets(at('21:00')) // без 'today'
    const result = defaultDeadlinePreset(at('02:00'), presets)
    expect(result).toBe(presets.find((p) => p.id === 'tomorrow'))
  })

  it('без «Сегодня» и «Завтра» - первый элемент списка', () => {
    const presets = deadlinePresets(at('12:00')).filter((p) => p.id !== 'today' && p.id !== 'tomorrow')
    expect(presets.length).toBeGreaterThan(0)
    expect(defaultDeadlinePreset(at('02:00'), presets)).toBe(presets[0])
    expect(defaultDeadlinePreset(at('12:00'), presets)).toBe(presets[0])
  })
})
