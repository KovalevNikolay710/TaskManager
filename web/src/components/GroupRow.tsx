import type { ReactNode, Ref } from 'react'
import { cx } from '../lib/cx'
import styles from './GroupRow.module.css'
import { Icon } from './Icon'

/** GroupList: карточка со строками групп (<li data-flip-key>). */
export function GroupList({ label, children, listRef }: { label: string; children: ReactNode; listRef?: Ref<HTMLUListElement> }) {
  return (
    <ul className={styles.list} aria-label={label} ref={listRef}>
      {children}
    </ul>
  )
}

/** WeightTile: вес группы «×3»; base — нейтральный вариант для «Без группы». */
export function WeightTile({ weight, base = false }: { weight: number; base?: boolean }) {
  return (
    <span className={cx(styles.tile, base && styles.tileBase)} aria-hidden="true">
      ×{weight}
    </span>
  )
}

interface GroupRowProps {
  name: string
  weight: number
  meta: string
  label: string
  pending?: boolean
  onOpen: () => void
}

/** GroupRow: строка группы — открывает Sheet «Изменить». */
export function GroupRow({ name, weight, meta, label, pending = false, onOpen }: GroupRowProps) {
  return (
    <button
      type="button"
      className={cx(styles.row, pending && styles.pending)}
      aria-label={label}
      aria-busy={pending || undefined}
      onClick={() => {
        if (!pending) onOpen()
      }}
    >
      <WeightTile weight={weight} />
      <span className={styles.body}>
        <span className={styles.name}>{name}</span>
        <span className={styles.meta}>{meta}</span>
      </span>
      {pending ? <span className={styles.spinner} aria-hidden="true" /> : <Icon name="chevronRight" className={styles.chevron} />}
    </button>
  )
}

/** Некликабельная строка «Без группы». */
export function StaticGroupRow({ name, meta }: { name: string; meta: string }) {
  return (
    <div className={cx(styles.row, styles.static)}>
      <WeightTile weight={1} base />
      <span className={styles.body}>
        <span className={styles.name}>{name}</span>
        <span className={styles.meta}>{meta}</span>
      </span>
    </div>
  )
}
