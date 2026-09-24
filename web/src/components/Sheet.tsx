import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './Button'
import { Icon } from './Icon'
import styles from './Sheet.module.css'

interface SheetProps {
  title: string
  onClose: () => void
  children: ReactNode
  /** Кнопки внизу: secondary «Отмена» и primary-действие */
  actions: ReactNode
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'

/**
 * Модальная панель: снизу на мобильном, диалог по центру на десктопе.
 * Закрывается по подложке, «×» и Esc; фокус заперт внутри и возвращается на кнопку-вызов.
 */
export function Sheet({ title, onClose, children, actions }: SheetProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const dialog = dialogRef.current
    // Фокус — на первое поле формы, если оно есть, иначе на первый интерактивный элемент
    const initialFocus = dialog?.querySelector<HTMLElement>('input:not([disabled])') ?? dialog?.querySelector<HTMLElement>(FOCUSABLE)
    initialFocus?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !dialog) return
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
      opener?.focus()
    }
  }, [])

  return createPortal(
    <div
      className={styles.backdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="sheet-title" ref={dialogRef}>
        <div className={styles.grip} aria-hidden="true" />
        <div className={styles.head}>
          <h2 className={styles.title} id="sheet-title">
            {title}
          </h2>
          <Button variant="icon" aria-label="Закрыть" onClick={onClose}>
            <Icon name="x" />
          </Button>
        </div>
        {children}
        <div className={styles.actions}>{actions}</div>
      </div>
    </div>,
    document.body,
  )
}
