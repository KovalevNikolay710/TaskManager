import { Link } from 'react-router-dom'
import { cx } from '../lib/cx'
import styles from './AvatarButton.module.css'

/** Пока пользователей нет — инициалы-заглушка «Я». */
const INITIALS = 'Я'

export function AvatarCircle({ className }: { className?: string }) {
  return <span className={cx(styles.circle, className)}>{INITIALS}</span>
}

/** Кнопка профиля в шапке (на десктопе скрыта — профиль внизу SideNav). */
export function AvatarButton() {
  return (
    <Link to="/profile" className={styles.button} aria-label="Профиль">
      <AvatarCircle />
    </Link>
  )
}
