import type { ReactNode, Ref } from 'react'
import { cx } from '../lib/cx'
import { Input } from './FormParts'
import { Icon, type IconName } from './Icon'
import styles from './SettingsCard.module.css'
import { Skeleton } from './Skeleton'

/** SettingsCard: список настроек в одной карточке, строки разделены линией. */
export function SettingsCard({ labelledBy, children }: { labelledBy?: string; children: ReactNode }) {
  return (
    <ul className={styles.settings} aria-labelledby={labelledBy}>
      {children}
    </ul>
  )
}

/** Пункт списка: строка настройки и пояснения под ней. */
export function SettingsItem({ children, busy }: { children: ReactNode; busy?: boolean }) {
  return <li aria-busy={busy || undefined}>{children}</li>
}

interface SettingsRowProps {
  icon: IconName
  title: ReactNode
  titleId: string
  sub?: ReactNode
  subId?: string
  /** Успешное состояние подписи (--color-success) */
  subOk?: boolean
  /** Переключатель справа */
  control: ReactNode
  /** Параметр настройки (время, чипы) вторым рядом под названием */
  extra?: ReactNode
  /** Настройка выключена — параметр скрыт (значение при этом не сбрасывается) */
  off?: boolean
}

/** Строка настройки: иконка | название и подпись | Switch; параметр — вторым рядом. Вся строка не кнопка. */
export function SettingsRow({ icon, title, titleId, sub, subId, subOk = false, control, extra, off = false }: SettingsRowProps) {
  return (
    <div className={styles.row}>
      <Icon name={icon} className={styles.icon} />
      <div className={styles.label}>
        <span className={styles.title} id={titleId}>
          {title}
        </span>
        {sub && (
          <span className={cx(styles.sub, subOk && styles.subOk)} id={subId}>
            {sub}
          </span>
        )}
      </div>
      {control}
      {extra && !off && <div className={styles.extra}>{extra}</div>}
    </div>
  )
}

/** Пояснение под строкой: Alert или подсказка. */
export function SettingsNotice({ children, spaced = false }: { children: ReactNode; spaced?: boolean }) {
  return <div className={cx(styles.notice, spaced && styles.noticeSpaced)}>{children}</div>
}

/** Низ карточки: кнопка и подсказка под ней. */
export function SettingsFoot({ children }: { children: ReactNode }) {
  return <div className={styles.foot}>{children}</div>
}

/** Заглушка строки при загрузке: иконка, две полосы текста, «таблетка» переключателя. */
export function SettingsSkeletonRow({ titleWidth, subWidth }: { titleWidth: string; subWidth: string }) {
  return (
    <div className={styles.row}>
      <Skeleton width={24} height={24} />
      <div className={styles.skeletonLines}>
        <Skeleton width={titleWidth} height={16} />
        <Skeleton width={subWidth} height={12} />
      </div>
      <span className={styles.skeletonSwitch}>
        <Skeleton width="var(--size-switch-w)" height="var(--size-switch-h)" round />
      </span>
    </div>
  )
}

/** Подпись параметра в строке настройки: «Во сколько», «За», «С», «до». */
export function SettingsExtraLabel({ htmlFor, id, children }: { htmlFor?: string; id?: string; children: ReactNode }) {
  return htmlFor ? (
    <label className={styles.extraLabel} htmlFor={htmlFor} id={id}>
      {children}
    </label>
  ) : (
    <span className={styles.extraLabel} id={id}>
      {children}
    </span>
  )
}

interface SettingsTimeInputProps {
  id: string
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  invalid?: boolean
  describedBy?: string
  ref?: Ref<HTMLInputElement>
}

/** Время «ЧЧ:ММ» в строке настройки (input type="time", 120px). */
export function SettingsTimeInput({ id, value, onChange, onBlur, invalid = false, describedBy, ref }: SettingsTimeInputProps) {
  return (
    <Input
      ref={ref}
      id={id}
      type="time"
      className={styles.timeInput}
      value={value}
      invalid={invalid}
      aria-describedby={describedBy}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
    />
  )
}

/** Подсказка под параметром на всю ширину строки. */
export function SettingsExtraHint({ children }: { children: ReactNode }) {
  return <span className={styles.extraHint}>{children}</span>
}
