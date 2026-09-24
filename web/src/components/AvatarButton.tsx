import { Link } from 'react-router-dom'
import styles from './AvatarButton.module.css'

/** Пока пользователей нет — инициалы-заглушка «Я». */
const INITIALS = 'Я'

export function AvatarCircle() {
  return <span className={styles.circle}>{INITIALS}</span>
}

/** Кнопка профиля в шапке (на десктопе скрыта — профиль внизу SideNav). */
export function AvatarButton() {
  return (
    <Link to="/profile" className={styles.button} aria-label="Профиль">
      <AvatarCircle />
    </Link>
  )
}
