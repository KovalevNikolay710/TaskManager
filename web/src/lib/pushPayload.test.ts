import { describe, expect, it } from 'vitest'
import { FALLBACK_PUSH_MESSAGE, parsePushPayload, safeAppPath } from './pushPayload'

const origin = 'https://tasks.example.com'

describe('safeAppPath', () => {
  it.each([
    ['/day', '/day'],
    ['/tasks/42', '/tasks/42'],
    ['/all-tasks?quick=1#top', '/all-tasks?quick=1#top'],
    ['/profile/../day', '/day'],
  ])('%s → %s', (raw, expected) => {
    expect(safeAppPath(raw, origin)).toBe(expected)
  })

  it.each([
    ['https://evil.example.com/day'],
    ['//evil.example.com/day'],
    ['/\\evil.example.com'],
    ['javascript:alert(1)'],
    ['day'],
    [''],
    [42],
    [null],
    [undefined],
  ])('%s → «/»', (raw) => {
    expect(safeAppPath(raw, origin)).toBe('/')
  })
})

describe('parsePushPayload', () => {
  it('разбирает сообщение сервера', () => {
    const raw = JSON.stringify({ title: 'Составьте план на сегодня', body: 'Активных задач: 9.', url: '/day', tag: 'plan-morning' })
    expect(parsePushPayload(raw, origin)).toEqual({ title: 'Составьте план на сегодня', body: 'Активных задач: 9.', url: '/day', tag: 'plan-morning' })
  })

  it('без tag и body — без tag, пустой текст', () => {
    expect(parsePushPayload(JSON.stringify({ title: 'Уведомления работают', url: '/profile' }), origin)).toEqual({
      title: 'Уведомления работают',
      body: '',
      url: '/profile',
    })
  })

  it('чужой адрес заменяется на «/»', () => {
    expect(parsePushPayload(JSON.stringify({ title: 'T', url: 'https://evil.example.com' }), origin).url).toBe('/')
  })

  it.each([[null], [''], ['не json'], ['[1,2]'], ['"строка"'], ['{"body":"без заголовка"}'], ['{"title":"   "}'], ['null']])(
    'битое сообщение %s → общий текст',
    (raw) => {
      expect(parsePushPayload(raw, origin)).toEqual(FALLBACK_PUSH_MESSAGE)
    },
  )
})
