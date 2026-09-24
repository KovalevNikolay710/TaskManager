import { useEffect, useId, useRef, type ReactNode } from 'react'
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
  /** Под кнопками, например danger-ghost «Удалить группу» */
  footer?: ReactNode
  /** alertdialog — подтверждение необратимого действия (ConfirmSheet) */
  role?: 'dialog' | 'alertdialog'
  /** false — пока идёт запрос: подложка, Esc и «×» не закрывают */
  dismissible?: boolean
  /** id элемента с текстом-пояснением (aria-describedby) */
  describedBy?: string
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'

/**
 * Модальная панель: снизу на мобильном, диалог по центру на десктопе.
 * Закрывается по подложке, «×» и Esc; фокус заперт внутри и возвращается на кнопку-вызов.
 */
export function Sheet({ title, onClose, children, actions, footer, role = 'dialog', dismissible = true, describedBy }: SheetProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const dismissibleRef = useRef(dismissible)

  useEffect(() => {
    onCloseRef.current = onClose
    dismissibleRef.current = dismissible
  })

  const close = () => {
    if (dismissible) onClose()
  }

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const dialog = dialogRef.current
    // Фокус — на элемент с data-autofocus, иначе на первое поле формы, иначе на первый интерактивный элемент
    const initialFocus =
      dialog?.querySelector<HTMLElement>('[data-autofocus]') ??
      dialog?.querySelector<HTMLElement>('input:not([disabled])') ??
      dialog?.querySelector<HTMLElement>(FOCUSABLE)
    initialFocus?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (dismissibleRef.current) onCloseRef.current()
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
        if (event.target === event.currentTarget) close()
      }}
    >
      <div className={styles.sheet} role={role} aria-modal="true" aria-labelledby={titleId} aria-describedby={describedBy} ref={dialogRef}>
        <div className={styles.grip} aria-hidden="true" />
        <div className={styles.head}>
          <h2 className={styles.title} id={titleId}>
            {title}
          </h2>
          <Button variant="icon" aria-label="Закрыть" onClick={close} disabled={!dismissible}>
            <Icon name="x" />
          </Button>
        </div>
        {children}
        <div className={styles.actions}>{actions}</div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
