import { useId, type ReactNode } from 'react'
import { useFlip } from '../hooks/useFlip'
import { cx } from '../lib/cx'
import styles from './GroupSection.module.css'
import { Icon } from './Icon'

interface GroupSectionProps {
  name: string
  /** Приоритет группы (множитель Pg); у «Без группы» не показывается */
  weight?: number
  count: string
  /** false во время поиска: группа всегда раскрыта, заголовок не нажимается */
  collapsible: boolean
  collapsed: boolean
  onToggle: () => void
  /** Строки задач: <li data-flip-key> */
  children: ReactNode
  footer?: ReactNode
}

export function GroupSection({ name, weight, count, collapsible, collapsed, onToggle, children, footer }: GroupSectionProps) {
  const bodyId = useId()
  const listRef = useFlip<HTMLUListElement>()
  const isCollapsed = collapsible && collapsed

  const headerContent = (
    <>
      <span className={styles.name}>{name}</span>
      {weight !== undefined && (
        <span className={styles.weight} title={`Приоритет группы ${weight}`}>
          ×{weight}
        </span>
      )}
      <span className={styles.count}>{count}</span>
      {collapsible && <Icon name="chevronDown" size="sm" className={styles.chevron} />}
    </>
  )

  return (
    <section className={cx(styles.group, isCollapsed && styles.collapsed)}>
      <h2 className={styles.heading}>
        {collapsible ? (
          <button className={styles.header} type="button" aria-expanded={!isCollapsed} aria-controls={bodyId} onClick={onToggle}>
            {headerContent}
          </button>
        ) : (
          <div className={styles.header}>{headerContent}</div>
        )}
      </h2>
      <div className={styles.card} id={bodyId} hidden={isCollapsed}>
        <ul className={styles.body} ref={listRef}>
          {children}
        </ul>
        {footer && <div className={styles.more}>{footer}</div>}
      </div>
    </section>
  )
}
