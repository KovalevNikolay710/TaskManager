import { useEffect, useRef, type ReactNode } from 'react'
import { cx } from '../lib/cx'
import { FREE_MIN_MINUTES, planAriaLabel, type DayPlanSummary } from '../lib/dayPlan'
import { formatDuration, formatPriority, plural } from '../lib/format'
import { weightClass } from '../lib/weight'
import styles from './DayChart.module.css'
import { Icon } from './Icon'

/** Идентификатор подсвеченного сектора: TaskId или «Свободно». */
export type ChartFocus = number | 'free' | null

// Геометрия кольца: viewBox 240×240, внешний радиус 112, внутренний 74
const C = 120
const R = 112
const r = 74

function point(radius: number, angle: number): string {
  return `${C + radius * Math.cos(angle)},${C + radius * Math.sin(angle)}`
}

/** Кольцевой сегмент от a0 до a1 (радианы). Дуги делятся пополам — так рисуется и полный круг. */
function arcPath(a0: number, a1: number): string {
  const mid = (a0 + a1) / 2
  const small = (from: number, to: number) => (to - from > Math.PI ? 1 : 0)
  return (
    `M${point(R, a0)}A${R},${R} 0 ${small(a0, mid)} 1 ${point(R, mid)}A${R},${R} 0 ${small(mid, a1)} 1 ${point(R, a1)}` +
    `L${point(r, a1)}A${r},${r} 0 ${small(mid, a1)} 0 ${point(r, mid)}A${r},${r} 0 ${small(a0, mid)} 0 ${point(r, a0)}Z`
  )
}

interface DayChartProps {
  summary: DayPlanSummary
  groupNames: ReadonlyMap<number, string>
  focus: ChartFocus
  /** Наведение на сектор (null — ушли) */
  onHover: (focus: ChartFocus) => void
  /** Тап по сектору закрепляет подсветку; повторный тап или тап вне кольца снимает */
  pinned: ChartFocus
  onPin: (focus: ChartFocus) => void
  /** Подсказка под сводкой (day-chart__note) */
  note?: ReactNode
}

/** DayChart — кольцевая диаграмма плана дня: какую часть времени дня занимает каждая задача. */
export function DayChart({ summary, groupNames, focus, onHover, pinned, onPin, note }: DayChartProps) {
  const figureRef = useRef<HTMLElement>(null)
  const { items, total, freeMinutes, activeMinutes, doneMinutes, doneCount } = summary
  const showFree = freeMinutes >= FREE_MIN_MINUTES
  const activeCount = items.length - doneCount

  // Тап вне кольца снимает закреплённую подсветку
  useEffect(() => {
    if (pinned === null) return
    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || !figureRef.current?.contains(event.target)) onPin(null)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [pinned, onPin])

  const sectorAngle = (minutes: number) => (total > 0 ? (minutes / total) * 2 * Math.PI : 0)
  // Секторы от 12 часов по часовой стрелке в порядке списка, затем «Свободно»
  const sectors = items
    .filter((item) => item.minutes > 0)
    .reduce<Array<{ id: ChartFocus; item: (typeof items)[number]; a0: number; a1: number }>>((acc, item) => {
      const a0 = acc.at(-1)?.a1 ?? -Math.PI / 2
      return [...acc, { id: item.task.TaskId, item, a0, a1: a0 + sectorAngle(item.minutes) }]
    }, [])
    .map((sector) => ({ ...sector, d: arcPath(sector.a0, sector.a1) }))
  const freeStart = sectors.at(-1)?.a1 ?? -Math.PI / 2
  const freePath = showFree ? arcPath(freeStart, freeStart + sectorAngle(freeMinutes)) : null

  const sectorHandlers = (id: ChartFocus) => ({
    onMouseEnter: () => onHover(id),
    onMouseLeave: () => onHover(null),
    onClick: () => onPin(pinned === id ? null : id),
  })

  const renderCenter = () => {
    if (focus === 'free' && showFree) {
      return (
        <>
          <span className={styles.value}>{formatDuration(freeMinutes)}</span>
          <span className={styles.label}>свободно</span>
        </>
      )
    }
    const item = focus === null ? undefined : items.find((i) => i.task.TaskId === focus)
    if (item) {
      const group = groupNames.get(item.task.GroupId) ?? 'Без группы'
      return (
        <>
          <span className={styles.name}>{item.task.Name}</span>
          <span className={cx(styles.value, styles.valueSmall)}>{formatDuration(item.minutes)}</span>
          <span className={styles.label}>{item.done ? 'выполнено' : `сегодня · ${group}`}</span>
        </>
      )
    }
    return (
      <>
        <span className={styles.value}>{formatDuration(activeMinutes)}</span>
        <span className={styles.label}>осталось из {formatDuration(total)}</span>
      </>
    )
  }

  return (
    <div className={styles.chart}>
      <figure className={cx(styles.figure, focus !== null && styles.focused)} ref={figureRef}>
        <svg className={styles.svg} viewBox="0 0 240 240" role="img" aria-label={planAriaLabel(summary)}>
          <circle className={styles.track} cx={C} cy={C} r={(R + r) / 2} strokeWidth={R - r} />
          {sectors.map(({ id, item, d }) => (
            <path
              key={item.task.TaskId}
              className={cx(
                styles.sector,
                weightClass(item.task.GroupPriorty),
                item.done && styles.sectorDone,
                focus === id && styles.sectorActive,
              )}
              d={d}
              {...sectorHandlers(id)}
            >
              <title>{`${item.task.Name} — ${formatDuration(item.minutes)}`}</title>
            </path>
          ))}
          {freePath && (
            <path className={cx(styles.sector, styles.sectorFree, focus === 'free' && styles.sectorActive)} d={freePath} {...sectorHandlers('free')}>
              <title>{`Свободно — ${formatDuration(freeMinutes)}`}</title>
            </path>
          )}
        </svg>
        <figcaption className={styles.center} aria-live="polite">
          {renderCenter()}
        </figcaption>
      </figure>

      <ul className={styles.summary}>
        <li>
          <span className={cx(styles.swatch, styles.swatchPlan)} aria-hidden="true" />
          В работе: {activeCount} {plural(activeCount, ['задача', 'задачи', 'задач'])}
          <b>{formatDuration(activeMinutes)}</b>
        </li>
        {doneCount > 0 && (
          <li>
            <span className={cx(styles.swatch, styles.swatchDone)} aria-hidden="true" />
            Выполнено: {doneCount}
            <b>{formatDuration(doneMinutes)}</b>
          </li>
        )}
        {showFree && (
          <li>
            <span className={cx(styles.swatch, styles.swatchFree)} aria-hidden="true" />
            Свободно
            <b>{formatDuration(freeMinutes)}</b>
          </li>
        )}
        <li className={styles.muted} title="Сумма приоритетов невыполненных задач плана">
          <Icon name="zap" size="sm" />
          Приоритет дня (осталось)
          <b className={styles.strong}>{summary.remainingPriority > 0 ? formatPriority(summary.remainingPriority) : '0'}</b>
        </li>
      </ul>

      {note && <div className={styles.note}>{note}</div>}
    </div>
  )
}
