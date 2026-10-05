import styles from './Fab.module.css'
import { Icon } from './Icon'

/**
 * Кнопка «Добавить задачу» на мобильном (на десктопе скрыта — вместо неё кнопка в шапке).
 * Открывает «Быструю задачу» (QuickAddSheet), а не переходит на /tasks/new.
 */
export function Fab({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className={styles.fab} aria-label="Добавить задачу" aria-haspopup="dialog" onClick={onClick}>
      <Icon name="plus" />
    </button>
  )
}
