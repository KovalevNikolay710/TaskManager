import { useEffect, useState, type ReactNode } from 'react'
import { cx } from '../lib/cx'
import { Button } from './Button'
import { Icon } from './Icon'
import styles from './PageHeader.module.css'

interface PageHeaderProps {
  title: string
  onBack: () => void
  backLabel?: string
  actions?: ReactNode
}

/** PageHeader вложенных экранов: «назад», заголовок и необязательные действия справа. */
export function PageHeader({ title, onBack, backLabel = 'Назад', actions }: PageHeaderProps) {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 0)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header className={cx(styles.header, scrolled && styles.scrolled)}>
      <Button variant="icon" className={styles.back} aria-label={backLabel} onClick={onBack}>
        <Icon name="chevronLeft" />
      </Button>
      <h1 className={styles.title}>{title}</h1>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  )
}
