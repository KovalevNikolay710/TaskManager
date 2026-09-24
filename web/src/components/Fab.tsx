import { Link } from 'react-router-dom'
import styles from './Fab.module.css'
import { Icon } from './Icon'

/** Кнопка «Добавить задачу» на мобильном (на десктопе скрыта — вместо неё кнопка в шапке). */
export function Fab({ to }: { to: string }) {
  return (
    <Link to={to} className={styles.fab} aria-label="Добавить задачу">
      <Icon name="plus" />
    </Link>
  )
}
