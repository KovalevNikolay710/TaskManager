import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { CURRENT_USER_ID } from '../api/user'
import { AvatarCircle } from './AvatarButton'
import styles from './AppShell.module.css'
import { Icon, type IconName } from './Icon'

const NAV_ITEMS: Array<{ to: string; label: string; icon: IconName }> = [
  { to: '/day', label: 'День', icon: 'calendar' },
  { to: '/all-tasks', label: 'Все задачи', icon: 'list' },
]

interface AppShellProps {
  children: ReactNode
  /** Плавающие элементы экрана (Fab), рендерятся вне колонки контента */
  floating?: ReactNode
}

/** Каркас экрана: SideNav (десктоп) / BottomNav (мобильный) и колонка контента. */
export function AppShell({ children, floating }: AppShellProps) {
  return (
    <div className={styles.app}>
      <aside className={styles.sideNav} aria-label="Основная навигация">
        <p className={styles.brand}>TaskManager</p>
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} className={styles.sideNavItem}>
            <Icon name={item.icon} />
            {item.label}
          </NavLink>
        ))}
        <Link to="/profile" className={styles.profile} aria-label="Профиль">
          <AvatarCircle />
          <span>
            <span className={styles.profileName}>Профиль</span>
            <span className={styles.profileSub}>Пользователь #{CURRENT_USER_ID}</span>
          </span>
        </Link>
      </aside>

      <main className={styles.main}>
        <div className={styles.content}>{children}</div>
      </main>

      {floating}

      <nav className={styles.bottomNav} aria-label="Основная навигация">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} className={styles.bottomNavItem}>
            <span className={styles.pill}>
              <Icon name={item.icon} />
            </span>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
