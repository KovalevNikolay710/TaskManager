import { describe, expect, it } from 'vitest'
import type { Task } from '../api/types'
import { calculatePriority, hoursUntil, queuePlace } from './priority'

// Эталонные случаи те же, что в Go-тесте calculateTaskPriorty (internal/services).
describe('calculatePriority', () => {
  it.each([
    { groupWeight: 3, minutes: 120, hours: 10, percent: 0, expected: 36 },
    { groupWeight: 1, minutes: 60, hours: 1, percent: 50, expected: 30 },
    { groupWeight: 2, minutes: 30, hours: 24, percent: 100, expected: 0 },
    { groupWeight: 10, minutes: 600, hours: 3, percent: 25, expected: 1500 },
  ])('Pg=$groupWeight Te=$minutes Tl=$hours %=$percent -> $expected', ({ expected, ...factors }) => {
    expect(calculatePriority(factors)).toBeCloseTo(expected, 9)
  })

  it('возвращает 0 при нулевом или отрицательном Tl вместо деления на ноль', () => {
    expect(calculatePriority({ groupWeight: 5, minutes: 60, hours: 0, percent: 0 })).toBe(0)
    expect(calculatePriority({ groupWeight: 5, minutes: 60, hours: -2, percent: 0 })).toBe(0)
  })
})

describe('hoursUntil', () => {
  const now = new Date('2026-10-05T20:30:00')

  it('считает целые часы', () => {
    expect(hoursUntil(new Date('2026-10-06T00:30:00'), now)).toBe(4)
  })

  it('отбрасывает дробную часть, как int(Hours()) на бэкенде', () => {
    expect(hoursUntil(new Date('2026-10-05T23:29:59'), now)).toBe(2)
    expect(hoursUntil(new Date('2026-10-05T21:29:00'), now)).toBe(0)
  })

  it('для прошедшего дедлайна отбрасывает к нулю, а не вниз', () => {
    // Math.trunc даёт -0; для Tl это равно нулю
    expect(hoursUntil(new Date('2026-10-05T19:45:00'), now)).toBeCloseTo(0, 9)
    expect(hoursUntil(new Date('2026-10-05T17:30:00'), now)).toBe(-3)
  })
})

describe('queuePlace', () => {
  const task = (id: number, priority: number, status: 1 | 2 = 1): Task => ({
    TaskId: id, UserId: 1, GroupId: 0, GroupPriorty: 1, DeadLine: '', TimeForExecution: 60, Priority: priority,
    NumberOfHoursUntilDL: 1, PercentOfCompleting: status === 2 ? 100 : 0, Status: status, Name: `t${id}`,
    Description: '', CreatedAt: '', UpdatedAt: '',
  })

  it('пустой список: первое место из одного', () => {
    expect(queuePlace(10, [])).toEqual({ place: 1, total: 1 })
  })

  it('место = 1 + число активных с большим приоритетом', () => {
    const tasks = [task(1, 50), task(2, 30), task(3, 10)]
    expect(queuePlace(20, tasks)).toEqual({ place: 3, total: 4 })
    expect(queuePlace(100, tasks)).toEqual({ place: 1, total: 4 })
  })

  it('равный приоритет не вытесняет', () => {
    expect(queuePlace(30, [task(1, 30)])).toEqual({ place: 1, total: 2 })
  })

  it('выполненные задачи не учитываются', () => {
    expect(queuePlace(1, [task(1, 99, 2), task(2, 5)])).toEqual({ place: 2, total: 2 })
  })

  it('excludeId исключает саму задачу', () => {
    const tasks = [task(1, 50), task(2, 30)]
    expect(queuePlace(30, tasks, 2)).toEqual({ place: 2, total: 2 })
  })
})
