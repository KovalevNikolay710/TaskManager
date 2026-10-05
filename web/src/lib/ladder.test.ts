import { describe, expect, it } from 'vitest'
import { hasGap, insertPlan, planChanges, type LadderItem } from './ladder'

const item = (id: number, weight: number): LadderItem => ({ id, weight })

describe('hasGap', () => {
  it('true, если обе ступени k и k+1 заняты другими группами', () => {
    expect(hasGap([item(1, 3), item(2, 4), item(3, 7)], 3, 3)).toBe(true)
  })

  it('false, если одна из ступеней свободна', () => {
    const items = [item(1, 3), item(2, 4), item(3, 7)]
    expect(hasGap(items, 3, 4)).toBe(false)
    expect(hasGap(items, 3, 2)).toBe(false)
  })

  it('ступень ×1 занята всегда («Без группы»)', () => {
    expect(hasGap([item(1, 2), item(2, 5)], 2, 1)).toBe(true)
    expect(hasGap([item(1, 3), item(2, 5)], 2, 1)).toBe(false)
  })

  it('перемещаемая группа не занимает свою ступень', () => {
    expect(hasGap([item(1, 3), item(2, 4)], 2, 3)).toBe(false)
  })

  it('пустая лесенка: промежутка нет', () => {
    expect(hasGap([], 1, 1)).toBe(false)
  })
})

describe('insertPlan', () => {
  it('свободная ступень сразу над k: никого не сдвигает', () => {
    expect(insertPlan([item(1, 5)], 1, 1)).toEqual({ target: 2, shifts: [] })
  })

  it('поднимает цепочку вверх до первой свободной ступени', () => {
    const plan = insertPlan([item(1, 2), item(2, 3), item(3, 6)], 3, 1)
    expect(plan).toEqual({
      target: 2,
      shifts: [{ id: 1, from: 2, to: 3 }, { id: 2, from: 3, to: 4 }],
    })
  })

  it('цепочка не трогает группы выше первой свободной ступени', () => {
    const plan = insertPlan([item(1, 2), item(2, 4), item(3, 9)], 3, 1)
    expect(plan).toEqual({ target: 2, shifts: [{ id: 1, from: 2, to: 3 }] })
  })

  it('упёршись в ×10, встаёт на k, а группы опускаются цепочкой', () => {
    const plan = insertPlan([item(1, 7), item(2, 8), item(3, 9), item(4, 10), item(5, 4)], 5, 7)
    expect(plan).toEqual({ target: 7, shifts: [{ id: 1, from: 7, to: 6 }] })
  })

  it('опускание доходит до ×2, но не занимает ×1', () => {
    const items = [3, 4, 5, 6, 7, 8, 9, 10].map((w, i) => item(i + 1, w))
    const plan = insertPlan([...items, item(99, 1)], 99, 5)
    expect(plan?.target).toBe(5)
    expect(plan?.shifts).toEqual([
      { id: 1, from: 3, to: 2 },
      { id: 2, from: 4, to: 3 },
      { id: 3, from: 5, to: 4 },
    ])
  })

  it('возвращает null, когда лесенка забита от ×1 до ×10', () => {
    const items = [2, 3, 4, 5, 6, 7, 8, 9, 10].map((w, i) => item(i + 1, w))
    expect(insertPlan([...items, item(99, 5)], 99, 5)).toBeNull()
  })

  it('перемещаемая группа не попадает в сдвиги', () => {
    const plan = insertPlan([item(1, 2), item(2, 3)], 1, 2)
    expect(plan?.shifts.every((s) => s.id !== 1)).toBe(true)
  })
})

describe('planChanges', () => {
  it('перемещаемая группа идёт первой, затем сдвинутые', () => {
    const plan = { target: 2, shifts: [{ id: 1, from: 2, to: 3 }] }
    expect(planChanges(9, 6, plan)).toEqual([{ id: 9, from: 6, to: 2 }, { id: 1, from: 2, to: 3 }])
  })

  it('если вес перемещаемой группы не меняется, её в изменениях нет', () => {
    const plan = { target: 5, shifts: [{ id: 1, from: 5, to: 6 }] }
    expect(planChanges(9, 5, plan)).toEqual([{ id: 1, from: 5, to: 6 }])
  })

  it('без сдвигов и без смены веса - пусто', () => {
    expect(planChanges(9, 4, { target: 4, shifts: [] })).toEqual([])
  })
})
