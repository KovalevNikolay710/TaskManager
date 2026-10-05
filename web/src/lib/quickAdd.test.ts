import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatShortDateTime, formatWeekdayDateTime } from './dates'
import {
  QUICK_DEFAULT_MINUTES,
  QUICK_DRAFT_KEY,
  QUICK_DRAFT_TTL_MS,
  buildNewTaskSearch,
  classifyQuickAddError,
  clearQuickDraft,
  createdTasksMessage,
  initialQuickValues,
  parseNewTaskSearch,
  parseQuickDraft,
  quickPlaceText,
  quickTimeLabel,
  readQuickDraft,
  resolveQuickDeadline,
  resolveQuickMinutes,
  saveQuickDraft,
  toQuickDraft,
  truncateText,
  type QuickAddDraft,
  type QuickAddValues,
} from './quickAdd'
import { deadlinePresets, type DeadlinePreset } from './taskForm'

const now = new Date('2026-10-05T12:00:00')
// Правило срока по умолчанию пишется отдельно; здесь подставляем заведомо другое — «Через неделю»
const pickWeek = (_now: Date, presets: DeadlinePreset[]) => presets.find((p) => p.id === 'inWeek')!

function draft(patch: Partial<QuickAddDraft> = {}): QuickAddDraft {
  return { name: 'Повторить билеты', deadline: { presetId: 'tomorrow' }, minutes: 30, groupId: 3, savedAt: now.getTime() - 60_000, ...patch }
}

describe('quickTimeLabel', () => {
  it.each([
    [15, '15 мин'],
    [30, '30 мин'],
    [60, '1:00'],
    [120, '2:00'],
  ])('%i -> %s', (minutes, label) => {
    expect(quickTimeLabel(minutes)).toBe(label)
  })
})

describe('resolveQuickDeadline / resolveQuickMinutes', () => {
  const presets = deadlinePresets(now)

  it('чип срока превращается в его дату и время', () => {
    expect(resolveQuickDeadline({ kind: 'preset', id: 'tomorrow' }, presets)).toEqual({ date: '2026-10-06', time: '18:00' })
  })

  it('исчезнувший чип — null', () => {
    expect(resolveQuickDeadline({ kind: 'preset', id: 'today' }, deadlinePresets(new Date('2026-10-05T21:00:00')))).toBeNull()
  })

  it('свой срок возвращается как есть', () => {
    expect(resolveQuickDeadline({ kind: 'custom', date: '2026-10-09', time: '12:00' }, presets)).toEqual({ date: '2026-10-09', time: '12:00' })
  })

  it('своё время: распознанное и в пределах 0:05–99:59', () => {
    expect(resolveQuickMinutes({ kind: 'preset', minutes: 60 })).toBe(60)
    expect(resolveQuickMinutes({ kind: 'custom', text: '3:30' })).toBe(210)
    expect(resolveQuickMinutes({ kind: 'custom', text: '0:04' })).toBeNull()
    expect(resolveQuickMinutes({ kind: 'custom', text: 'abc' })).toBeNull()
  })

  it('границы своего времени: 0:05 и 99:59 допустимы', () => {
    expect(resolveQuickMinutes({ kind: 'custom', text: '0:05' })).toBe(5)
    expect(resolveQuickMinutes({ kind: 'custom', text: '99:59' })).toBe(5999)
  })
})

describe('parseQuickDraft', () => {
  it('читает свежий черновик', () => {
    expect(parseQuickDraft(JSON.stringify(draft()), now)).toEqual(draft())
  })

  it('черновик старше суток не восстанавливается (граница — ровно 24 ч)', () => {
    const almost = draft({ savedAt: now.getTime() - QUICK_DRAFT_TTL_MS + 1 })
    const expired = draft({ savedAt: now.getTime() - QUICK_DRAFT_TTL_MS })
    expect(parseQuickDraft(JSON.stringify(almost), now)).not.toBeNull()
    expect(parseQuickDraft(JSON.stringify(expired), now)).toBeNull()
  })

  it('пустой, битый или чужой формат — null', () => {
    expect(parseQuickDraft(null, now)).toBeNull()
    expect(parseQuickDraft('{', now)).toBeNull()
    expect(parseQuickDraft('"text"', now)).toBeNull()
    expect(parseQuickDraft(JSON.stringify(draft({ name: '   ' })), now)).toBeNull()
    expect(parseQuickDraft(JSON.stringify({ ...draft(), minutes: '30' }), now)).toBeNull()
    expect(parseQuickDraft(JSON.stringify({ ...draft(), deadline: { presetId: 'someday' } }), now)).toBeNull()
    expect(parseQuickDraft(JSON.stringify({ ...draft(), savedAt: undefined }), now)).toBeNull()
  })

  it('черновик «из будущего» дальше 5 минут отклоняется', () => {
    expect(parseQuickDraft(JSON.stringify(draft({ savedAt: now.getTime() + 4 * 60_000 })), now)).not.toBeNull()
    expect(parseQuickDraft(JSON.stringify(draft({ savedAt: now.getTime() + 6 * 60_000 })), now)).toBeNull()
  })

  it('неверная группа заменяется на «без группы», черновик остаётся', () => {
    for (const groupId of [-1, 1.5, Number.MAX_SAFE_INTEGER + 2]) {
      expect(parseQuickDraft(JSON.stringify(draft({ groupId })), now)?.groupId).toBe(0)
    }
    expect(parseQuickDraft(JSON.stringify({ ...draft(), groupId: '3' }), now)?.groupId).toBe(0)
  })

  it('слишком длинное название обрезается до 200 символов', () => {
    expect(parseQuickDraft(JSON.stringify(draft({ name: 'а'.repeat(250) })), now)?.name).toHaveLength(200)
  })

  it('свой срок в черновике', () => {
    const custom = draft({ deadline: { date: '2026-10-09', time: '12:00' } })
    expect(parseQuickDraft(JSON.stringify(custom), now)?.deadline).toEqual({ date: '2026-10-09', time: '12:00' })
  })
})

describe('toQuickDraft', () => {
  const values: QuickAddValues = { name: 'Купить билеты', deadline: { kind: 'preset', id: 'in3days' }, minutes: { kind: 'preset', minutes: 60 }, groupId: 2 }

  it('чип срока хранится по id, время — в минутах, момент записи — now', () => {
    expect(toQuickDraft(values, now)).toEqual({
      name: 'Купить билеты',
      deadline: { presetId: 'in3days' },
      minutes: 60,
      groupId: 2,
      savedAt: now.getTime(),
    })
  })

  it('свой срок хранится датой и временем; нераспознанное время — по умолчанию', () => {
    const custom = toQuickDraft({ ...values, deadline: { kind: 'custom', date: '2026-10-09', time: '12:00' }, minutes: { kind: 'custom', text: 'x' } }, now)
    expect(custom.deadline).toEqual({ date: '2026-10-09', time: '12:00' })
    expect(custom.minutes).toBe(QUICK_DEFAULT_MINUTES)
  })

  it('черновик переживает запись и чтение', () => {
    const stored = JSON.stringify(toQuickDraft({ ...values, minutes: { kind: 'custom', text: '3:30' } }, now))
    expect(initialQuickValues(parseQuickDraft(stored, now), now, 0, pickWeek)).toEqual({ ...values, minutes: { kind: 'custom', text: '3:30' } })
  })
})

describe('initialQuickValues', () => {
  it('без черновика: пусто, срок по правилу, 30 минут, последняя группа', () => {
    expect(initialQuickValues(null, now, 4, pickWeek)).toEqual({
      name: '',
      deadline: { kind: 'preset', id: 'inWeek' },
      minutes: { kind: 'preset', minutes: 30 },
      groupId: 4,
    })
  })

  it('черновик восстанавливает название, чип срока, время и группу', () => {
    expect(initialQuickValues(draft({ minutes: 120 }), now, 0, pickWeek)).toEqual({
      name: 'Повторить билеты',
      deadline: { kind: 'preset', id: 'tomorrow' },
      minutes: { kind: 'preset', minutes: 120 },
      groupId: 3,
    })
  })

  it('чипа из черновика уже нет — срок по правилу', () => {
    const late = new Date('2026-10-05T21:00:00')
    const values = initialQuickValues(draft({ deadline: { presetId: 'today' }, savedAt: late.getTime() }), late, 0, pickWeek)
    expect(values.deadline).toEqual({ kind: 'preset', id: 'inWeek' })
  })

  it('свой срок восстанавливается, только если до него не меньше часа', () => {
    const ok = initialQuickValues(draft({ deadline: { date: '2026-10-05', time: '13:00' } }), now, 0, pickWeek)
    expect(ok.deadline).toEqual({ kind: 'custom', date: '2026-10-05', time: '13:00' })
    const close = initialQuickValues(draft({ deadline: { date: '2026-10-05', time: '12:59' } }), now, 0, pickWeek)
    expect(close.deadline).toEqual({ kind: 'preset', id: 'inWeek' })
    const broken = initialQuickValues(draft({ deadline: { date: '2026-02-31', time: '12:00' } }), now, 0, pickWeek)
    expect(broken.deadline).toEqual({ kind: 'preset', id: 'inWeek' })
  })

  it('время не из чипов — своё значение; вне диапазона — по умолчанию', () => {
    expect(initialQuickValues(draft({ minutes: 210 }), now, 0, pickWeek).minutes).toEqual({ kind: 'custom', text: '3:30' })
    expect(initialQuickValues(draft({ minutes: 2 }), now, 0, pickWeek).minutes).toEqual({ kind: 'preset', minutes: 30 })
  })
})

describe('buildNewTaskSearch / parseNewTaskSearch', () => {
  it('собирает параметры полной формы', () => {
    const search = buildNewTaskSearch({ name: '  Повторить билеты ', date: '2026-10-06', time: '18:00', minutes: 30, groupId: 3 })
    expect(search).toBe('name=%D0%9F%D0%BE%D0%B2%D1%82%D0%BE%D1%80%D0%B8%D1%82%D1%8C+%D0%B1%D0%B8%D0%BB%D0%B5%D1%82%D1%8B&date=2026-10-06&time=18%3A00&te=30&groupId=3')
  })

  it('пустое название не передаётся, groupId = 0 передаётся', () => {
    expect(buildNewTaskSearch({ name: '   ', groupId: 0 })).toBe('groupId=0')
  })

  it('туда и обратно без потерь', () => {
    const prefill = { name: 'Отчёт & план', date: '2026-10-06', time: '18:00', minutes: 210, groupId: 0 }
    expect(parseNewTaskSearch(new URLSearchParams(buildNewTaskSearch(prefill)))).toEqual(prefill)
  })

  it('каждый невалидный параметр пропускается отдельно', () => {
    const params = new URLSearchParams('name=%20%20&date=2026-02-31&time=25:00&te=1.5&groupId=-1')
    expect(parseNewTaskSearch(params)).toEqual({})
    const mixed = new URLSearchParams('name=Задача&date=2026-13-01&time=09:30&te=4&groupId=7')
    expect(parseNewTaskSearch(mixed)).toEqual({ name: 'Задача', time: '09:30', groupId: 7 })
  })

  it('te — от 5 до 5999 минут', () => {
    expect(parseNewTaskSearch(new URLSearchParams('te=5')).minutes).toBe(5)
    expect(parseNewTaskSearch(new URLSearchParams('te=5999')).minutes).toBe(5999)
    expect(parseNewTaskSearch(new URLSearchParams('te=6000')).minutes).toBeUndefined()
  })

  it('время — строго ЧЧ:ММ от 00:00 до 23:59', () => {
    expect(parseNewTaskSearch(new URLSearchParams('time=24:00')).time).toBeUndefined()
    expect(parseNewTaskSearch(new URLSearchParams('time=9:30')).time).toBeUndefined()
    expect(parseNewTaskSearch(new URLSearchParams('time=23:59')).time).toBe('23:59')
  })

  it('te и groupId — только целые без знака, ведущих нулей и экспоненты', () => {
    expect(parseNewTaskSearch(new URLSearchParams('te=0030')).minutes).toBeUndefined()
    expect(parseNewTaskSearch(new URLSearchParams('te=-5')).minutes).toBeUndefined()
    expect(parseNewTaskSearch(new URLSearchParams('groupId=1e3')).groupId).toBeUndefined()
    expect(parseNewTaskSearch(new URLSearchParams('groupId=007')).groupId).toBeUndefined()
    expect(parseNewTaskSearch(new URLSearchParams(`groupId=${'9'.repeat(40)}`)).groupId).toBeUndefined()
    expect(parseNewTaskSearch(new URLSearchParams('groupId=0')).groupId).toBe(0)
  })

  it('слишком длинное название обрезается до 200 символов', () => {
    expect(parseNewTaskSearch(new URLSearchParams({ name: 'а'.repeat(250) })).name).toHaveLength(200)
  })
})

describe('classifyQuickAddError', () => {
  it('сеть', () => {
    expect(classifyQuickAddError(0, 'Не удалось связаться с сервером')).toEqual({
      kind: 'alert',
      title: 'Не удалось добавить задачу',
      text: 'Сервер не ответил. Всё введённое на месте — нажмите «Добавить» ещё раз.',
    })
  })

  it('срок стал слишком близким — ошибка под рядом срока', () => {
    // Текст ErrInvalidDeadline из internal/services/errors.go
    expect(classifyQuickAddError(400, 'неверный дедлайн: он должен быть не раньше чем через час')).toEqual({ kind: 'deadline' })
    expect(classifyQuickAddError(500, 'Дедлайн уже прошёл')).toEqual({ kind: 'deadline' })
    expect(classifyQuickAddError(400, 'неверная дата')).toEqual({ kind: 'alert', title: 'Сервер не принял данные', text: 'неверная дата' })
    expect(classifyQuickAddError(404, 'дедлайн')).toEqual({ kind: 'alert', title: 'Не удалось добавить задачу', text: 'дедлайн' })
  })

  it('прочие 400 и остальные ответы', () => {
    expect(classifyQuickAddError(400, 'Неверный формат')).toEqual({ kind: 'alert', title: 'Сервер не принял данные', text: 'Неверный формат' })
    expect(classifyQuickAddError(500, 'Внутренняя ошибка')).toEqual({ kind: 'alert', title: 'Не удалось добавить задачу', text: 'Внутренняя ошибка' })
  })
})

describe('тексты', () => {
  it('место в строке успеха', () => {
    expect(quickPlaceText(5, 12)).toBe('5-я из 12')
  })

  it.each([
    [1, 'Задача создана'],
    [2, 'Добавлено 2 задачи'],
    [5, 'Добавлено 5 задач'],
    [21, 'Добавлено 21 задача'],
  ])('Toast после закрытия: %i -> %s', (count, text) => {
    expect(createdTasksMessage(count)).toBe(text)
  })

  it('даты для чипов срока', () => {
    expect(formatWeekdayDateTime(new Date('2026-10-08T18:00:00'))).toBe('чт, 8 октября, 18:00')
    expect(formatShortDateTime(new Date('2026-10-09T12:00:00'))).toBe('пт, 9 окт, 12:00')
  })
})

describe('truncateText', () => {
  it('короткий текст не меняется', () => {
    expect(truncateText('Задача', 200)).toBe('Задача')
  })

  it('не разрывает суррогатную пару на границе', () => {
    // «😀» — две единицы UTF-16: на границе 4 он целиком не помещается и отбрасывается
    expect(truncateText('abc😀d', 4)).toBe('abc')
    expect(truncateText('abc😀d', 5)).toBe('abc😀')
  })
})

describe('readQuickDraft / saveQuickDraft / clearQuickDraft', () => {
  const values: QuickAddValues = { name: 'Купить билеты', deadline: { kind: 'preset', id: 'tomorrow' }, minutes: { kind: 'preset', minutes: 30 }, groupId: 2 }

  function stubStorage() {
    const store = new Map<string, string>()
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
        removeItem: (key: string) => void store.delete(key),
      },
    })
    return store
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('записывает, читает и удаляет черновик', () => {
    const store = stubStorage()
    saveQuickDraft(values, now)
    expect(JSON.parse(store.get(QUICK_DRAFT_KEY)!)).toMatchObject({ name: 'Купить билеты', deadline: { presetId: 'tomorrow' } })
    expect(readQuickDraft(now)?.name).toBe('Купить билеты')
    clearQuickDraft()
    expect(store.has(QUICK_DRAFT_KEY)).toBe(false)
    expect(readQuickDraft(now)).toBeNull()
  })

  it('пустое название удаляет черновик, а не пишет пустой', () => {
    const store = stubStorage()
    saveQuickDraft(values, now)
    saveQuickDraft({ ...values, name: '   ' }, now)
    expect(store.has(QUICK_DRAFT_KEY)).toBe(false)
  })

  it('недоступное хранилище не роняет лист', () => {
    const broken = () => {
      throw new Error('SecurityError')
    }
    vi.stubGlobal('window', { localStorage: { getItem: broken, setItem: broken, removeItem: broken } })
    expect(() => saveQuickDraft(values, now)).not.toThrow()
    expect(readQuickDraft(now)).toBeNull()
    expect(() => clearQuickDraft()).not.toThrow()
  })
})
