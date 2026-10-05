import { useEffect, useId, useRef, type CSSProperties, type PointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useKeyboardInset } from '../hooks/useKeyboardInset'
import { cx } from '../lib/cx'
import { Button } from './Button'
import { Icon } from './Icon'
import styles from './Sheet.module.css'

interface SheetProps {
  title: string
  onClose: () => void
  children: ReactNode
  /** Кнопки внизу: secondary «Отмена» и primary-действие (у «Быстрой задачи» их нет) */
  actions?: ReactNode
  /** Под кнопками, например danger-ghost «Удалить группу» */
  footer?: ReactNode
  /** alertdialog — подтверждение необратимого действия (ConfirmSheet) */
  role?: 'dialog' | 'alertdialog'
  /** false — пока идёт запрос: подложка, Esc и «×» не закрывают */
  dismissible?: boolean
  /** id элемента с текстом-пояснением (aria-describedby) */
  describedBy?: string
  /**
   * quick — «Быстрая задача» (sheet--quick): на десктопе шире и прижат к верху, высота — по экрану
   * за вычетом клавиатуры, ручку можно смахнуть вниз
   */
  variant?: 'default' | 'quick'
  /** Кнопки в шапке перед «×» (например, «Подробнее →») */
  headActions?: ReactNode
}

const FOCUSABLE =
  'button:not([disabled]):not([tabindex="-1"]), input:not([disabled]):not([tabindex="-1"]), [href], [tabindex]:not([tabindex="-1"])'

/** Смахивание ручки: дальше стольких пикселей или быстрее стольких px/мс — закрыть */
const SWIPE_CLOSE_PX = 80
const SWIPE_CLOSE_VELOCITY = 0.5
/** Быстрый жест засчитывается, если ручку протащили хотя бы на столько (иначе это тап) */
const SWIPE_MIN_PX = 16
/** Через столько мс после смахивания лист возвращается на место, если он всё ещё открыт */
const SWIPE_RESET_MS = 400

/**
 * Модальная панель: снизу на мобильном, диалог по центру на десктопе.
 * Закрывается по подложке, «×» и Esc; фокус заперт внутри и возвращается на кнопку-вызов.
 */
export function Sheet({
  title,
  onClose,
  children,
  actions,
  footer,
  role = 'dialog',
  dismissible = true,
  describedBy,
  variant = 'default',
  headActions,
}: SheetProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const swipeRef = useRef<{ y: number; t: number; dy: number } | null>(null)
  const swipeResetTimer = useRef<number | undefined>(undefined)
  const quick = variant === 'quick'
  const keyboardInset = useKeyboardInset(quick)
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
        // Esc, которым отменяют ввод в IME, лист не закрывает
        if (event.isComposing) return
        event.preventDefault()
        if (dismissibleRef.current) onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !dialog) return
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      // Фокус вне диалога (например, ушёл на body после скрытия элемента) — возвращаем внутрь
      if (!dialog.contains(document.activeElement)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      } else if (event.shiftKey && document.activeElement === first) {
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

  // Смахивание ручки вниз (только «Быстрая задача»): лист едет за пальцем, далеко или быстро — закрывается
  const setOffset = (dy: number) => {
    if (dialogRef.current) dialogRef.current.style.transform = dy > 0 ? `translateY(${dy}px)` : ''
  }
  const onGripDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!quick || !dismissible) return
    event.currentTarget.setPointerCapture(event.pointerId)
    swipeRef.current = { y: event.clientY, t: event.timeStamp, dy: 0 }
  }
  const onGripMove = (event: PointerEvent<HTMLDivElement>) => {
    const swipe = swipeRef.current
    if (!swipe) return
    swipe.dy = Math.max(0, event.clientY - swipe.y)
    setOffset(swipe.dy)
  }
  const onGripUp = (event: PointerEvent<HTMLDivElement>) => {
    const swipe = swipeRef.current
    swipeRef.current = null
    if (!swipe) return
    const velocity = swipe.dy / Math.max(1, event.timeStamp - swipe.t)
    if (swipe.dy > SWIPE_CLOSE_PX || (swipe.dy > SWIPE_MIN_PX && velocity > SWIPE_CLOSE_VELOCITY)) {
      // Лист остаётся там, куда его утащили, до размонтирования. Если закрытие не случилось
      // (например, уже закрывается или нельзя закрыть) — возвращаем его на место
      close()
      window.clearTimeout(swipeResetTimer.current)
      swipeResetTimer.current = window.setTimeout(() => setOffset(0), SWIPE_RESET_MS)
    } else {
      setOffset(0)
    }
  }
  // Жест прерван системой — это не смахивание: просто вернуть лист на место
  const onGripCancel = () => {
    swipeRef.current = null
    setOffset(0)
  }
  useEffect(() => () => window.clearTimeout(swipeResetTimer.current), [])

  return createPortal(
    <div
      className={cx(styles.backdrop, quick && styles.backdropTop)}
      // Высота клавиатуры там, где она не уменьшает окно (см. useKeyboardInset): лист встаёт над ней
      style={keyboardInset > 0 ? ({ '--keyboard-inset': `${keyboardInset}px` } as CSSProperties) : undefined}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <div
        className={cx(styles.sheet, quick && styles.quick)}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedBy}
        // Чтобы фокус можно было вернуть в сам диалог, а клик по его фону не уводил фокус наружу
        tabIndex={-1}
        ref={dialogRef}
      >
        <div
          className={cx(styles.grip, quick && styles.gripSwipe)}
          aria-hidden="true"
          onPointerDown={onGripDown}
          onPointerMove={onGripMove}
          onPointerUp={onGripUp}
          onPointerCancel={onGripCancel}
        />
        <div className={cx(styles.head, quick && styles.headQuick)}>
          <h2 className={styles.title} id={titleId}>
            {title}
          </h2>
          {headActions}
          <Button variant="icon" className={quick ? styles.closeQuick : undefined} aria-label="Закрыть" onClick={close} disabled={!dismissible}>
            <Icon name="x" />
          </Button>
        </div>
        {children}
        {actions && <div className={styles.actions}>{actions}</div>}
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
