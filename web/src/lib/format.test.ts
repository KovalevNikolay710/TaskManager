import { describe, expect, it } from 'vitest'
import { formatDuration, formatPriority, parseDuration, plural } from './format'

describe('parseDuration', () => {
  it.each([
    ['2:30', 150],
    ['0:45', 45],
    ['02:05', 125],
    ['2', 120],
    ['12', 720],
    ['230', 150],
    ['1000', 600],
    ['  1:30  ', 90],
    ['0', 0],
    ['2:5', 125],
  ])('%j -> %j', (input, expected) => {
    expect(parseDuration(input)).toBe(expected)
  })

  it.each(['', '   ', 'abc', '2:60', '260', '1:2:3', '-1', '1.5', '12345', '123:00', '2,30', '2:'])(
    '%j не распознаётся',
    (input) => {
      expect(parseDuration(input)).toBeNull()
    },
  )
})

describe('formatDuration', () => {
  it.each([
    [150, '2:30'],
    [45, '0:45'],
    [0, '0:00'],
    [60, '1:00'],
    [5, '0:05'],
    [5999, '99:59'],
  ])('%i -> %s', (minutes, expected) => {
    expect(formatDuration(minutes)).toBe(expected)
  })

  it('отрицательные значения сводит к нулю, дробные округляет', () => {
    expect(formatDuration(-10)).toBe('0:00')
    expect(formatDuration(89.6)).toBe('1:30')
  })

  it('обратим с parseDuration', () => {
    for (const m of [5, 59, 60, 61, 150, 960]) expect(parseDuration(formatDuration(m))).toBe(m)
  })
})

describe('plural', () => {
  const forms: [string, string, string] = ['задача', 'задачи', 'задач']
  it.each([
    [0, 'задач'], [1, 'задача'], [2, 'задачи'], [4, 'задачи'], [5, 'задач'], [10, 'задач'],
    [11, 'задач'], [12, 'задач'], [14, 'задач'], [21, 'задача'], [22, 'задачи'], [25, 'задач'],
    [100, 'задач'], [101, 'задача'], [111, 'задач'], [112, 'задач'], [-1, 'задача'], [-12, 'задач'],
  ])('%i -> %s', (n, expected) => {
    expect(plural(n, forms)).toBe(expected)
  })
})

describe('formatPriority', () => {
  it.each([
    [36, '36,0'],
    [0, '0,0'],
    [1500, '1500,0'],
    [12.34, '12,3'],
    [0.1, '0,1'],
  ])('%d -> %s', (value, expected) => {
    expect(formatPriority(value)).toBe(expected)
  })

  it('совсем малые положительные значения показывает как «<0,1»', () => {
    expect(formatPriority(0.05)).toBe('<0,1')
    expect(formatPriority(0.0001)).toBe('<0,1')
  })
})
