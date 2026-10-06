import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { CURRENT_USER_ID } from '../api/user'
import { AvatarCircle } from './AvatarButton'
import styles from './AppShell.module.css'
import { Icon, type IconName } from './Icon'

type Section = 'day' | 'all-tasks' | 'groups' | 'profile'

const SIDE_NAV_ITEMS: Array<{ to: string; label: string; icon: IconName; section: Exclude<Section, 'profile'> }> = [
  { to: '/day', label: 'День', icon: 'calendar', section: 'day' },
  { to: '/all-tasks', label: 'Все задачи', icon: 'list', section: 'all-tasks' },
  { to: '/groups', label: 'Группы', icon: 'folder', section: 'groups' },
]

// В BottomNav только два главных экрана: «Группы» — раздел внутри «Все задачи» (design/foundations/layout.md, «Screen map»)
const BOTTOM_NAV_ITEMS = SIDE_NAV_ITEMS.filter((item) => item.section !== 'groups')

/** Раздел по маршруту: экраны задачи относятся к «Все задачи»; у профиля в BottomNav активного пункта нет. */
function sectionOf(pathname: string): Section | null {
  if (pathname.startsWith('/day')) return 'day'
  if (pathname.startsWith('/all-tasks') || pathname.startsWith('/tasks')) return 'all-tasks'
  if (pathname.startsWith('/groups')) return 'groups'
  if (pathname.startsWith('/profile')) return 'profile'
  return null
}

interface AppShellProps {
  children: ReactNode
  /** Плавающие элементы экрана (Fab), рендерятся вне колонки контента */
  floating?: ReactNode
  /** false — экраны-формы: на мобильном внизу ActionBar вместо BottomNav */
  bottomNav?: boolean
}

/** Каркас экрана: SideNav (десктоп) / BottomNav (мобильный) и колонка контента. */
export function AppShell({ children, floating, bottomNav = true }: AppShellProps) {
  const section = sectionOf(useLocation().pathname)
  const bottomSection = section === 'groups' ? 'all-tasks' : section
  return (
    <div className={styles.app}>
      <aside className={styles.sideNav} aria-label="Основная навигация">
        <p className={styles.brand}>TaskManager</p>
        {SIDE_NAV_ITEMS.map((item) => (
          <Link key={item.to} to={item.to} className={styles.sideNavItem} aria-current={item.section === section ? 'page' : undefined}>
            <Icon name={item.icon} />
            {item.label}
          </Link>
        ))}
        <Link to="/profile" className={styles.profile} aria-label="Профиль" aria-current={section === 'profile' ? 'page' : undefined}>
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

      {bottomNav && (
        <nav className={styles.bottomNav} aria-label="Основная навигация">
          {BOTTOM_NAV_ITEMS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={styles.bottomNavItem}
              aria-current={item.section === bottomSection ? 'page' : undefined}
            >
              <span className={styles.pill}>
                <Icon name={item.icon} />
              </span>
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  )
}
