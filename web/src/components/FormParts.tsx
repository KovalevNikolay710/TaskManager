import type { InputHTMLAttributes, ReactNode, Ref, TextareaHTMLAttributes } from 'react'
import { cx } from '../lib/cx'
import styles from './Form.module.css'
import { Icon } from './Icon'

/** FormCard: смысловой блок формы с заголовком. */
export function FormCard({ title, titleId, children }: { title?: ReactNode; titleId?: string; children: ReactNode }) {
  return (
    <section className={styles.card} aria-labelledby={title ? titleId : undefined}>
      {title && (
        <h2 className={styles.cardTitle} id={titleId}>
          {title}
        </h2>
      )}
      {children}
    </section>
  )
}

export function Field({ children }: { children: ReactNode }) {
  return <div className={styles.field}>{children}</div>
}

export function FieldLabel({ htmlFor, children, optional }: { htmlFor: string; children: ReactNode; optional?: boolean }) {
  return (
    <label className={styles.label} htmlFor={htmlFor}>
      {children}
      {optional && <span className={styles.optional}> — необязательно</span>}
    </label>
  )
}

export type HintTone = 'default' | 'error' | 'warning' | 'soon' | 'overdue'

const HINT_TONES: Record<HintTone, string | undefined> = {
  default: undefined,
  error: styles.hintError,
  warning: styles.hintWarning,
  soon: styles.hintSoon,
  overdue: styles.hintOverdue,
}

/** Подсказка, предупреждение или ошибка под полем. */
export function FieldHint({ id, tone = 'default', icon, children }: { id?: string; tone?: HintTone; icon?: 'flag' | 'alert'; children: ReactNode }) {
  return (
    <span className={cx(styles.hint, HINT_TONES[tone])} id={id}>
      {icon && <Icon name={icon} size="xs" />}
      {children}
    </span>
  )
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
  ref?: Ref<HTMLInputElement>
}

export function Input({ invalid = false, className, ...rest }: InputProps) {
  return <input className={cx(styles.input, invalid && styles.inputError, className)} aria-invalid={invalid || undefined} {...rest} />
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  ref?: Ref<HTMLTextAreaElement>
}

export function Textarea({ className, ...rest }: TextareaProps) {
  return <textarea className={cx(styles.textarea, className)} {...rest} />
}
