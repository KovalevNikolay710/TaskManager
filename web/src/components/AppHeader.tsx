import { useEffect, useState, type ReactNode } from 'react'
import { cx } from '../lib/cx'
import styles from './AppHeader.module.css'
import { AvatarButton } from './AvatarButton'

interface AppHeaderProps {
  title: string
  subtitle?: ReactNode
  /** Действия справа перед аватаром (например, «Новая задача» на десктопе) */
  actions?: ReactNode
}

export function AppHeader({ title, subtitle, actions }: AppHeaderProps) {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 0)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header className={cx(styles.header, scrolled && styles.scrolled)}>
      <div>
        <h1 className={styles.title}>{title}</h1>
        {/* Место под подзаголовок держим всегда, чтобы шапка не прыгала при загрузке */}
        <p className={styles.subtitle}>{subtitle ?? ' '}</p>
      </div>
      <div className={styles.actions}>
        {actions}
        <AvatarButton />
      </div>
    </header>
  )
}
