import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import type { Group } from '../api/types'
import { cx } from '../lib/cx'
import { GROUP_WEIGHT_MAX, GROUP_WEIGHT_MIN } from '../lib/groups'
import { hasGap, insertPlan, type InsertPlan, type LadderItem } from '../lib/ladder'
import { weightClass } from '../lib/weight'
import { Button } from './Button'
import styles from './GroupLadder.module.css'
import { Icon } from './Icon'

/** Группа на лесенке с готовыми подписями. */
export interface LadderEntry {
  group: Group
  /** Ступень: GroupPriority, ограниченный 1–10 */
  weight: number
  /** «4 задачи · 1 выполнена» */
  meta: string
  /** aria-label кнопки «Изменить» */
  label: string
}

/** Перенос: на ступень N или в промежуток между ступенями k и k+1. */
export type LadderMove = { groupId: number; kind: 'step'; step: number } | { groupId: number; kind: 'gap'; k: number; plan: InsertPlan }

type Target = { kind: 'step'; step: number } | { kind: 'gap'; k: number; plan: InsertPlan }

interface DragState {
  id: number
  pointerId: number
  startX: number
  startY: number
  /** Смещение точки захвата от левого верхнего угла карточки */
  offsetX: number
  offsetY: number
  x: number
  y: number
  width: number
  active: boolean
  target: Target | null
  /** Палец над промежутком, где свободной ступени нет */
  blocked: boolean
}

interface LatestHandlers {
  cancelPlacing: () => void
  endDrag: (drop: boolean) => void
  findTarget: (x: number, y: number, id: number) => { target: Target | null; blocked: boolean }
  updateDrag: (next: DragState | null) => void
}

interface GroupLadderProps {
  entries: readonly LadderEntry[]
  /** Мета «Без группы»: «1 задача · всегда ×1» */
  noGroupMeta: string
  /** Группы, чьи изменения сохраняются */
  pendingIds: ReadonlySet<number>
  /** Идёт сохранение переноса — ручки недоступны */
  locked: boolean
  /** Только что созданная группа — подсвечивается 2 с */
  highlightedId: number | null
  onEdit: (group: Group) => void
  onMove: (move: LadderMove) => void
}

const STEPS = Array.from({ length: GROUP_WEIGHT_MAX }, (_, i) => GROUP_WEIGHT_MAX - i)
/** Полоса у границы двух занятых ступеней, в которой срабатывает вставка, px */
const GAP_ZONE = 10
/** Сдвиг пальца, после которого начинается перетаскивание (мышь — почти сразу), px */
const DRAG_THRESHOLD = { touch: 6, mouse: 2 }
/** Зона автопрокрутки у края экрана, px */
const SCROLL_EDGE = 72
const SCROLL_SPEED = 12

function gapText(k: number, plan: InsertPlan | null, names: ReadonlyMap<number, string>): string {
  if (!plan) return `Между ×${k} и ×${k + 1}: нет свободной ступени`
  if (plan.shifts.length === 0) return `Между ×${k} и ×${k + 1}: встанет на ×${plan.target}`
  const up = plan.shifts[0].to > plan.shifts[0].from
  const moved = [...plan.shifts]
    .sort((a, b) => a.to - b.to)
    .map((s) => `${names.get(s.id) ?? ''} ×${s.to}`)
    .join(', ')
  return `Между ×${k} и ×${k + 1}: встанет на ×${plan.target}, ${up ? 'поднимутся' : 'опустятся'}: ${moved}`
}

/**
 * GroupLadder — лесенка групп ×10…×1 (design/system.md). Перенос — перетаскиванием за ручку ⋮⋮
 * или без перетаскивания: короткий тап / Enter по ручке включает режим размещения с кнопками-целями.
 */
export function GroupLadder({ entries, noGroupMeta, pendingIds, locked, highlightedId, onEdit, onMove }: GroupLadderProps) {
  const ladderRef = useRef<HTMLOListElement>(null)
  const stepRefs = useRef(new Map<number, HTMLLIElement>())
  const dragRef = useRef<DragState | null>(null)
  const suppressClick = useRef(false)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [placingId, setPlacingId] = useState<number | null>(null)
  // Актуальные обработчики для слушателей window, подписанных в эффектах (без переподписки на каждый рендер)
  const latest = useRef<LatestHandlers>({
    cancelPlacing: () => undefined,
    endDrag: () => undefined,
    findTarget: () => ({ target: null, blocked: false }),
    updateDrag: () => undefined,
  })

  const items: LadderItem[] = entries.map((e) => ({ id: e.group.GroupId, weight: e.weight }))
  const names = new Map(entries.map((e) => [e.group.GroupId, e.group.Name]))
  const movingId = drag?.active ? drag.id : placingId
  const moving = entries.find((e) => e.group.GroupId === movingId)

  // ---------- FLIP: группы плавно переезжают между ступенями при смене весов ----------
  const rects = useRef(new Map<string, { x: number; y: number }>())
  const signature = entries.map((e) => `${e.group.GroupId}:${e.weight}`).join(',')
  const lastSignature = useRef(signature)
  useLayoutEffect(() => {
    const root = ladderRef.current
    if (!root) return
    const rootRect = root.getBoundingClientRect()
    const styles = getComputedStyle(document.documentElement)
    const duration = parseFloat(styles.getPropertyValue('--duration-normal')) || 0
    const easing = styles.getPropertyValue('--easing-standard').trim() || 'ease'
    const animate = lastSignature.current !== signature && duration > 0
    const next = new Map<string, { x: number; y: number }>()
    for (const el of root.querySelectorAll<HTMLElement>('[data-ladder-id]')) {
      const rect = el.getBoundingClientRect()
      const pos = { x: rect.left - rootRect.left, y: rect.top - rootRect.top }
      const key = el.dataset.ladderId ?? ''
      next.set(key, pos)
      const prev = rects.current.get(key)
      if (animate && prev && (prev.x !== pos.x || prev.y !== pos.y)) {
        el.animate([{ transform: `translate(${prev.x - pos.x}px, ${prev.y - pos.y}px)` }, { transform: 'none' }], { duration, easing })
      }
    }
    rects.current = next
    lastSignature.current = signature
  })

  // ---------- Режим размещения ----------
  const placeTargets = () => Array.from(ladderRef.current?.querySelectorAll<HTMLButtonElement>('[data-place-target]:not(:disabled)') ?? [])

  useEffect(() => {
    if (placingId === null) return
    placeTargets()[0]?.focus()
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        latest.current.cancelPlacing()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [placingId, latest])

  const handleOf = (groupId: number) => ladderRef.current?.querySelector<HTMLButtonElement>(`[data-handle="${groupId}"]`)

  function cancelPlacing() {
    const id = placingId
    setPlacingId(null)
    if (id !== null) requestAnimationFrame(() => handleOf(id)?.focus())
  }

  const place = (move: LadderMove) => {
    setPlacingId(null)
    onMove(move)
    // Фокус возвращается на ручку перенесённой группы (уже на новой ступени)
    requestAnimationFrame(() => handleOf(move.groupId)?.focus())
  }

  const onPlaceKeyDown = (event: KeyboardEvent<HTMLOListElement>) => {
    if (placingId === null || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return
    const targets = placeTargets()
    const index = targets.indexOf(document.activeElement as HTMLButtonElement)
    if (index < 0) return
    event.preventDefault()
    const next = (index + (event.key === 'ArrowDown' ? 1 : -1) + targets.length) % targets.length
    targets[next].focus()
  }

  // ---------- Перетаскивание ----------
  const findTarget = (x: number, y: number, id: number): { target: Target | null; blocked: boolean } => {
    const root = ladderRef.current?.getBoundingClientRect()
    if (!root || x < root.left || x > root.right || y < root.top - GAP_ZONE || y > root.bottom + GAP_ZONE) {
      return { target: null, blocked: false }
    }
    let blocked = false
    // Граница между ступенями n и n−1 — низ строки n
    for (let n = GROUP_WEIGHT_MAX; n > GROUP_WEIGHT_MIN; n--) {
      const rect = stepRefs.current.get(n)?.getBoundingClientRect()
      if (!rect || Math.abs(y - rect.bottom) > GAP_ZONE || !hasGap(items, id, n - 1)) continue
      const plan = insertPlan(items, id, n - 1)
      if (plan) return { target: { kind: 'gap', k: n - 1, plan }, blocked: false }
      blocked = true
    }
    for (const n of STEPS) {
      const rect = stepRefs.current.get(n)?.getBoundingClientRect()
      if (rect && y >= rect.top && y < rect.bottom) return { target: { kind: 'step', step: n }, blocked }
    }
    return { target: null, blocked }
  }

  const updateDrag = (next: DragState | null) => {
    dragRef.current = next
    setDrag(next)
  }

  const endDrag = (drop: boolean) => {
    const state = dragRef.current
    updateDrag(null)
    if (!state?.active || !drop || !state.target) return
    const current = entries.find((e) => e.group.GroupId === state.id)
    if (state.target.kind === 'step') {
      if (current && state.target.step !== current.weight) onMove({ groupId: state.id, kind: 'step', step: state.target.step })
    } else {
      onMove({ groupId: state.id, kind: 'gap', k: state.target.k, plan: state.target.plan })
    }
  }

  // Esc отменяет перетаскивание; у края экрана список автопрокручивается
  const dragging = Boolean(drag?.active)
  useEffect(() => {
    if (!dragging) return
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        latest.current.endDrag(false)
      }
    }
    let frame = 0
    const tick = () => {
      const state = dragRef.current
      if (state?.active) {
        const delta = state.y < SCROLL_EDGE ? -SCROLL_SPEED : state.y > window.innerHeight - SCROLL_EDGE ? SCROLL_SPEED : 0
        if (delta) {
          window.scrollBy(0, delta)
          latest.current.updateDrag({ ...state, ...latest.current.findTarget(state.x, state.y, state.id) })
        }
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [dragging, latest])

  const onHandlePointerDown = (event: PointerEvent<HTMLButtonElement>, groupId: number) => {
    if (locked || event.button !== 0) return
    const card = event.currentTarget.closest<HTMLElement>('[data-ladder-id]')
    const rect = card?.getBoundingClientRect()
    if (!rect) return
    event.currentTarget.setPointerCapture(event.pointerId)
    updateDrag({
      id: groupId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      x: event.clientX,
      y: event.clientY,
      width: rect.width,
      active: false,
      target: null,
      blocked: false,
    })
  }

  const onHandlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const state = dragRef.current
    if (!state || state.pointerId !== event.pointerId) return
    const threshold = event.pointerType === 'mouse' ? DRAG_THRESHOLD.mouse : DRAG_THRESHOLD.touch
    const active = state.active || Math.hypot(event.clientX - state.startX, event.clientY - state.startY) > threshold
    if (!active) return
    if (!state.active) setPlacingId(null)
    updateDrag({ ...state, active, x: event.clientX, y: event.clientY, ...findTarget(event.clientX, event.clientY, state.id) })
  }

  const onHandlePointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const state = dragRef.current
    if (!state || state.pointerId !== event.pointerId) return
    // После перетаскивания браузер пришлёт click — он не должен включать режим размещения
    suppressClick.current = state.active
    endDrag(true)
  }

  const onHandleClick = (groupId: number) => {
    if (suppressClick.current) {
      suppressClick.current = false
      return
    }
    if (locked) return
    if (placingId === groupId) cancelPlacing()
    else setPlacingId(groupId)
  }

  useLayoutEffect(() => {
    latest.current = { cancelPlacing, endDrag, findTarget, updateDrag }
  })

  // ---------- Разметка ----------
  const previewShifts = new Map<number, number>()
  if (drag?.active && drag.target?.kind === 'gap') for (const s of drag.target.plan.shifts) previewShifts.set(s.id, s.to)
  const placing = placingId !== null && !dragging

  const renderGroup = (entry: LadderEntry, lifted = false) => {
    const id = entry.group.GroupId
    const shiftTo = previewShifts.get(id)
    const overflow = entry.group.GroupPriority > GROUP_WEIGHT_MAX ? ` · ×${entry.group.GroupPriority}` : ''
    return (
      <li
        key={lifted ? `lifted-${id}` : id}
        data-ladder-id={lifted ? undefined : id}
        className={cx(
          styles.group,
          weightClass(entry.weight),
          lifted && styles.lifted,
          !lifted && dragging && drag?.id === id && styles.ghost,
          !lifted && placing && placingId === id && styles.moving,
          pendingIds.has(id) && styles.pending,
          highlightedId === id && styles.highlighted,
        )}
      >
        <button
          type="button"
          className={styles.main}
          aria-label={entry.label}
          aria-busy={pendingIds.has(id) || undefined}
          tabIndex={lifted ? -1 : undefined}
          onClick={() => {
            if (!pendingIds.has(id)) onEdit(entry.group)
          }}
        >
          <span className={styles.name}>{entry.group.Name}</span>
          <span className={styles.meta}>
            {entry.meta}
            {overflow}
            {shiftTo !== undefined && <span className={styles.shift}>→ ×{shiftTo}</span>}
          </span>
        </button>
        <button
          type="button"
          className={styles.handle}
          data-handle={lifted ? undefined : id}
          aria-label={`Переместить «${entry.group.Name}» на другую ступень`}
          aria-pressed={placingId === id}
          disabled={locked}
          tabIndex={lifted ? -1 : undefined}
          onPointerDown={(e) => onHandlePointerDown(e, id)}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          onPointerCancel={() => endDrag(false)}
          onClick={() => onHandleClick(id)}
        >
          <Icon name="grip" size="sm" />
        </button>
      </li>
    )
  }

  const steps = new Set(items.filter((i) => i.id !== movingId).map((i) => i.weight))
  steps.add(GROUP_WEIGHT_MIN)
  const draggedEntry = dragging ? entries.find((e) => e.group.GroupId === drag?.id) : undefined

  return (
    <>
      {placing && moving && (
        <div className={styles.banner} role="status">
          <span>Куда поставить «{moving.group.Name}»? Выберите ступень или место между группами.</span>
          <Button variant="ghost" onClick={cancelPlacing}>
            Отмена
          </Button>
        </div>
      )}
      <ol
        ref={ladderRef}
        className={cx(styles.ladder, dragging && styles.dragging, placing && styles.placing)}
        aria-label="Лесенка групп: сверху самые важные"
        onKeyDown={onPlaceKeyDown}
      >
        {STEPS.map((n) => {
          const here = entries.filter((e) => e.weight === n)
          const busy = here.length > 0 || n === GROUP_WEIGHT_MIN
          const hot = dragging && drag?.target?.kind === 'step' && drag.target.step === n
          const isCurrent = moving?.weight === n
          const gapK = n - 1
          const showGap = movingId !== null && n > GROUP_WEIGHT_MIN && steps.has(n) && steps.has(gapK)
          const gapPlan = showGap ? insertPlan(items, movingId, gapK) : null
          const gapHot = dragging && drag?.target?.kind === 'gap' && drag.target.k === gapK
          return [
            <li
              key={`step-${n}`}
              ref={(el) => {
                if (el) stepRefs.current.set(n, el)
                else stepRefs.current.delete(n)
              }}
              className={cx(styles.step, weightClass(n), busy && styles.busy, hot && styles.hot)}
              style={{ '--n': n } as CSSProperties}
            >
              <div className={styles.rail} aria-hidden="true">
                <span className={styles.tread} />
                <span className={styles.num}>×{n}</span>
              </div>
              <ul className={styles.groups} aria-label={`Ступень ×${n}`}>
                {here.map((entry) => renderGroup(entry))}
                {n === GROUP_WEIGHT_MIN && (
                  <li className={cx(styles.group, styles.static)}>
                    <span className={styles.main}>
                      <span className={styles.name}>Без группы</span>
                      <span className={styles.meta}>{noGroupMeta}</span>
                    </span>
                  </li>
                )}
                {placing && moving && !isCurrent && (
                  <li>
                    <button
                      type="button"
                      className={styles.place}
                      data-place-target
                      onClick={() => place({ groupId: moving.group.GroupId, kind: 'step', step: n })}
                    >
                      {busy ? 'Сюда, рядом' : `Поставить на ×${n}`}
                    </button>
                  </li>
                )}
                {!busy && !(placing && !isCurrent) && <li className={styles.empty}>свободно</li>}
              </ul>
            </li>,
            showGap && moving && (
              <li key={`gap-${n}`} className={cx(styles.gap, gapHot && styles.gapHot)}>
                <span className={styles.gapLine} />
                {gapHot && gapPlan && <span className={styles.gapLabel}>Вставить на ×{gapPlan.target}</span>}
                {placing && (
                  <button
                    type="button"
                    className={styles.gapButton}
                    data-place-target
                    disabled={!gapPlan}
                    onClick={() => gapPlan && place({ groupId: moving.group.GroupId, kind: 'gap', k: gapK, plan: gapPlan })}
                  >
                    {gapText(gapK, gapPlan, names)}
                  </button>
                )}
              </li>
            ),
          ]
        })}
      </ol>
      {draggedEntry && drag && (
        <ul
          className={styles.liftedLayer}
          style={{ left: drag.x - drag.offsetX, top: drag.y - drag.offsetY, width: drag.width }}
          aria-hidden="true"
        >
          {renderGroup(draggedEntry, true)}
          {drag.blocked && <li className={styles.dragHint}>Нет свободной ступени — поставьте рядом</li>}
        </ul>
      )}
    </>
  )
}
