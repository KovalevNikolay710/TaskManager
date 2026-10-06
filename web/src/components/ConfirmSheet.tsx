import { useId, type ReactNode } from 'react'
import { Alert } from './Alert'
import { Button } from './Button'
import { Sheet } from './Sheet'
import styles from './ConfirmSheet.module.css'

interface ConfirmSheetProps {
  title: string
  children: ReactNode
  confirmLabel: string
  /** Текст кнопки во время запроса («Удаляем…») */
  pendingLabel?: string
  cancelLabel?: string
  pending?: boolean
  error?: string | null
  errorTitle?: string
  onConfirm: () => void
  onCancel: () => void
}

/** ConfirmSheet: подтверждение необратимого действия; фокус на «Отмена». */
export function ConfirmSheet({
  title,
  children,
  confirmLabel,
  pendingLabel,
  cancelLabel = 'Отмена',
  pending = false,
  error,
  errorTitle = 'Не получилось',
  onConfirm,
  onCancel,
}: ConfirmSheetProps) {
  const textId = useId()
  return (
    <Sheet
      title={title}
      role="alertdialog"
      describedBy={textId}
      dismissible={!pending}
      onClose={onCancel}
      actions={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={pending} data-autofocus>
            {cancelLabel}
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={pending}>
            {pending && pendingLabel ? pendingLabel : confirmLabel}
          </Button>
        </>
      }
    >
      <div className={styles.body}>
        {error && <Alert title={errorTitle}>{error}</Alert>}
        <p className={styles.text} id={textId}>
          {children}
        </p>
      </div>
    </Sheet>
  )
}
