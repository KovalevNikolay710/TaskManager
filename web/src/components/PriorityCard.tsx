import { useId, useState, type ReactNode } from 'react'
import { cx } from '../lib/cx'
import { formatPriority } from '../lib/format'
import type { PriorityFactorRow } from '../lib/priority'
import { readStorage, writeStorage } from '../lib/storage'
import type { PriorityLevel } from '../lib/tasks'
import { Badge } from './Badge'
import { Icon } from './Icon'
import { PriorityChip } from './PriorityChip'
import styles from './PriorityCard.module.css'

const EXPLAINED_KEY = 'tm.priorityExplained'


type PriorityCardProps =
  | {
      /** Приоритет ещё не посчитать (форма не заполнена) */
      state: 'empty'
      text: string
    }
  | {
      state: 'done'
      text: string
    }
  | {
      state: 'active'
      priority: number
      level: PriorityLevel
      rank?: string
      text: string
      /** Прогноз при несохранённых изменениях */
      next?: ReactNode
      factors: PriorityFactorRow[]
    }

/** PriorityCard: приоритет задачи, место в очереди и «Из чего складывается» по раскрытию. */
export function PriorityCard(props: PriorityCardProps) {
  const labelId = useId()
  const [explained, setExplained] = useState(() => readStorage(EXPLAINED_KEY) === '1')

  if (props.state !== 'active') {
    return (
      <section className={cx(styles.card, styles[props.state])} aria-labelledby={labelId}>
        <div className={styles.head}>
          <span className={styles.label} id={labelId}>
            Приоритет
          </span>
          {props.state === 'done' && <Badge>0</Badge>}
        </div>
        <p className={styles.text}>{props.text}</p>
      </section>
    )
  }

  const { priority, level, rank, text, next, factors } = props
  return (
    <section className={cx(styles.card, styles[level], styles.withDetails)} aria-labelledby={labelId}>
      <div className={styles.head}>
        <span className={styles.label} id={labelId}>
          Приоритет
        </span>
        <PriorityChip priority={priority} level={level} />
        {rank && <span className={styles.rank}>{rank}</span>}
      </div>
      <p className={styles.text}>{text}</p>
      {next && (
        <span className={styles.next} role="status">
          {next}
        </span>
      )}
      <details
        className={styles.disclosure}
        open={explained}
        onToggle={(event) => {
          const open = event.currentTarget.open
          setExplained(open)
          writeStorage(EXPLAINED_KEY, open ? '1' : '0')
        }}
      >
        <summary>
          Из чего складывается
          <Icon name="chevronDown" size="sm" className={styles.chevron} />
        </summary>
        <ul className={styles.factors}>
          {factors.map((factor) => (
            <li className={styles.factor} key={factor.name}>
              <span className={styles.op}>{factor.op}</span>
              <span>
                {factor.name}
                <span className={styles.sub}>{factor.sub}</span>
              </span>
              <span className={styles.value}>{factor.value}</span>
            </li>
          ))}
          <li className={cx(styles.factor, styles.total)}>
            <span className={styles.op}>=</span>
            <span>Приоритет</span>
            <span className={styles.value}>{formatPriority(priority)}</span>
          </li>
        </ul>
        <p className={styles.formula}>Pt = Pg × Te ÷ Tl × %in</p>
      </details>
    </section>
  )
}
