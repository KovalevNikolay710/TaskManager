import { cx } from '../lib/cx'
import type { ButtonVariant } from './Button'
import styles from './Button.module.css'

/** Стили кнопки для ссылок (<Link>), например «К задачам» или «Новая задача». */
export function buttonClassName(variant: ButtonVariant, className?: string): string {
  return cx(styles.btn, styles[variant], styles.link, className)
}
