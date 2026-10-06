import { useMutation } from '@tanstack/react-query'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { sendTestPush } from '../api/push'
import type { NotificationSettings, NotificationSettingsUpdateRequest } from '../api/types'
import { CURRENT_USER_ID } from '../api/user'
import { Alert } from '../components/Alert'
import { AppHeader } from '../components/AppHeader'
import { AppShell } from '../components/AppShell'
import { Button } from '../components/Button'
import { FieldHint } from '../components/FormParts'
import { Icon } from '../components/Icon'
import { ProfileCard } from '../components/ProfileCard'
import { RadioChips } from '../components/RadioChips'
import { SectionTitle } from '../components/SectionTitle'
import {
  SettingsCard,
  SettingsExtraHint,
  SettingsExtraLabel,
  SettingsFoot,
  SettingsItem,
  SettingsNotice,
  SettingsRow,
  SettingsSkeletonRow,
  SettingsTimeInput,
} from '../components/SettingsCard'
import { Switch } from '../components/Switch'
import { useNotificationSettings, useSaveNotificationSettings } from '../hooks/useNotificationSettings'
import { usePushDevice, type PushViewState } from '../hooks/usePushDevice'
import { useNativeChangeRef, useTimeDraft } from '../hooks/useTimeDraft'
import { useToast } from '../hooks/useToast'
import {
  DEADLINE_HOURS_OPTIONS,
  browserTimezone,
  deadlineHoursLabel,
  needsTimezoneSync,
  normalizeTime,
  quietHoursHint,
} from '../lib/notificationSettings'
import { isStaleSubscriptionError } from '../lib/push'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Неизвестная ошибка'
}

type Save = (patch: NotificationSettingsUpdateRequest, options?: { silent?: boolean }) => void

const DEADLINE_OPTIONS = DEADLINE_HOURS_OPTIONS.map((hours) => ({ value: hours, label: `${hours} ч`, ariaLabel: deadlineHoursLabel(hours) }))

/** Экран «Профиль»: пользователь и напоминания (design/screens/profile.md). */
export function ProfilePage() {
  const id = useId()
  const settingsQuery = useNotificationSettings()
  const save = useSaveNotificationSettings()

  // Часовой пояс браузера молча уходит на сервер: при включении push — всегда (шаг 5),
  // при открытии экрана — если на сервере пусто или другой пояс
  const push = usePushDevice({
    onEnabled: () => {
      const timezone = browserTimezone()
      if (timezone) save({ timezone }, { silent: true })
    },
  })

  const timezoneSyncedRef = useRef(false)
  const settings = settingsQuery.data
  useEffect(() => {
    if (!settings || timezoneSyncedRef.current) return
    timezoneSyncedRef.current = true
    const timezone = browserTimezone()
    if (timezone && needsTimezoneSync(settings.Timezone, timezone)) save({ timezone }, { silent: true })
  }, [settings, save])

  const pushOn = push.state.kind === 'on'
  const titleId = `${id}-title`

  return (
    <AppShell>
      <AppHeader title="Профиль" avatar={false} />
      <ProfileCard name={`Пользователь #${CURRENT_USER_ID}`} sub="Вход и синхронизация появятся позже" />

      <SectionTitle title="Уведомления" id={titleId} />
      <SettingsCard labelledBy={titleId}>
        <PushItem state={push.state} onEnable={push.enable} onDisable={push.disable} onRetry={push.retry} onRecheck={push.recheck} />

        {/* Данные есть — показываем их, даже если фоновое обновление не удалось */}
        {settings ? (
          <ReminderItems settings={settings} save={save} />
        ) : settingsQuery.isError ? (
          <SettingsItem>
            <SettingsNotice spaced>
              <Alert
                title="Не удалось загрузить напоминания"
                autoFocus={false}
                action={
                  <Button variant="secondary" loading={settingsQuery.isFetching} onClick={() => void settingsQuery.refetch()}>
                    {!settingsQuery.isFetching && <Icon name="refresh" size="sm" />}
                    Повторить
                  </Button>
                }
              >
                {errorMessage(settingsQuery.error)}
              </Alert>
            </SettingsNotice>
          </SettingsItem>
        ) : (
          <>
            <SettingsItem busy>
              <SettingsSkeletonRow titleWidth="70%" subWidth="50%" />
            </SettingsItem>
            <SettingsItem busy>
              <SettingsSkeletonRow titleWidth="60%" subWidth="40%" />
            </SettingsItem>
          </>
        )}

        <TestItem pushOn={pushOn} endpoint={push.subscription?.endpoint} onStale={push.dropStale} />
      </SettingsCard>
    </AppShell>
  )
}

const PUSH_SUBTITLES: Record<PushViewState['kind'], string> = {
  on: 'Включены на этом устройстве',
  off: 'Напомним о плане и дедлайнах, даже когда приложение закрыто',
  error: 'Напомним о плане и дедлайнах, даже когда приложение закрыто',
  checking: 'Напомним о плане и дедлайнах, даже когда приложение закрыто',
  pending: 'Разрешите уведомления в окне браузера…',
  denied: 'Заблокированы в настройках браузера',
  unsupported: 'Недоступны в этом браузере',
}

interface PushItemProps {
  state: PushViewState
  onEnable: () => void
  onDisable: () => void
  onRetry: () => void
  onRecheck: () => void
}

/** Главная строка: push на этом устройстве, пояснения под ней. */
function PushItem({ state, onEnable, onDisable, onRetry, onRecheck }: PushItemProps) {
  const id = useId()
  const { kind } = state
  // Во время запроса разрешения aria-checked=false + aria-busy: «включено» — только по факту
  const checked = kind === 'on'
  const switchRef = useRef<HTMLButtonElement>(null)

  // «Повторить» и «Проверить снова» исчезают вместе со своим Alert — фокус возвращается на Switch,
  // если он потерялся (ушёл на body), а не остался там, куда его перевёл пользователь
  const prevKindRef = useRef(kind)
  useEffect(() => {
    const prev = prevKindRef.current
    prevKindRef.current = kind
    if (prev === kind || (prev !== 'error' && prev !== 'denied')) return
    const active = document.activeElement
    if (!active || active === document.body) switchRef.current?.focus()
  }, [kind])

  function onChange(next: boolean) {
    if (!next) onDisable()
    else if (kind === 'error') onRetry()
    else onEnable()
  }

  return (
    <SettingsItem>
      <SettingsRow
        icon="bell"
        title="Push-уведомления"
        titleId={`${id}-l`}
        sub={PUSH_SUBTITLES[kind]}
        subId={`${id}-d`}
        subOk={kind === 'on'}
        control={
          <Switch
            ref={switchRef}
            checked={checked}
            onChange={onChange}
            labelledBy={`${id}-l`}
            describedBy={`${id}-d`}
            pending={kind === 'pending'}
            disabled={kind === 'denied' || kind === 'unsupported' || kind === 'checking'}
          />
        }
      />

      {kind === 'denied' && (
        <SettingsNotice>
          <Alert
            tone="warning"
            title="Уведомления заблокированы"
            steps={[
              'в установленном приложении — долгое нажатие на иконку TaskManager → «О приложении» → «Уведомления»;',
              'в браузере — значок слева от адреса → «Разрешения» → «Уведомления» → «Разрешить».',
            ]}
            action={
              <Button variant="secondary" onClick={onRecheck}>
                <Icon name="refresh" size="sm" />
                Проверить снова
              </Button>
            }
          >
            Разрешить их можно только в настройках:
          </Alert>
        </SettingsNotice>
      )}

      {kind === 'unsupported' && (
        <SettingsNotice>
          <Alert tone="info" title="Браузер не умеет присылать уведомления">
            На Android откройте TaskManager в Chrome и установите на главный экран: ⋮ → «Установить приложение». На iPhone уведомления
            работают только у приложения, добавленного на экран «Домой» (iOS 16.4 и новее).
          </Alert>
        </SettingsNotice>
      )}

      {state.kind === 'error' && (
        <SettingsNotice>
          <Alert
            title="Не удалось включить уведомления"
            action={
              <Button variant="secondary" onClick={onRetry}>
                <Icon name="refresh" size="sm" />
                Повторить
              </Button>
            }
          >
            {state.message}
          </Alert>
        </SettingsNotice>
      )}

      {kind !== 'on' && kind !== 'checking' && (
        <SettingsNotice>
          <FieldHint>Настройки ниже сохранятся, но на это устройство напоминания не придут, пока уведомления выключены.</FieldHint>
        </SettingsNotice>
      )}
    </SettingsItem>
  )
}

/** Строки напоминаний: утро, вечер, «Дедлайн скоро», тихие часы. */
function ReminderItems({ settings, save }: { settings: NotificationSettings; save: Save }) {
  const id = useId()
  return (
    <>
      <SettingsItem>
        <ReminderRow
          id={`${id}-m`}
          icon="sun"
          title="Утром: составить план"
          sub="Если плана на сегодня ещё нет"
          enabled={settings.MorningEnabled}
          onToggle={(next) => save({ morningEnabled: next })}
        >
          <ReminderTime id={`${id}-m-time`} saved={settings.MorningTime} onCommit={(value) => save({ morningTime: value })} />
        </ReminderRow>
      </SettingsItem>

      <SettingsItem>
        <ReminderRow
          id={`${id}-e`}
          icon="moon"
          title="Вечером: отметить сделанное"
          sub="Если в плане дня остались неотмеченные задачи"
          enabled={settings.EveningEnabled}
          onToggle={(next) => save({ eveningEnabled: next })}
        >
          <ReminderTime id={`${id}-e-time`} saved={settings.EveningTime} onCommit={(value) => save({ eveningTime: value })} />
        </ReminderRow>
      </SettingsItem>

      <SettingsItem>
        <ReminderRow
          id={`${id}-d`}
          icon="flag"
          title="Дедлайн скоро"
          sub="Один раз по каждой невыполненной задаче"
          enabled={settings.DeadlineEnabled}
          onToggle={(next) => save({ deadlineEnabled: next })}
        >
          <SettingsExtraLabel id={`${id}-d-h`}>За</SettingsExtraLabel>
          <RadioChips
            options={DEADLINE_OPTIONS}
            value={settings.DeadlineHoursBefore}
            onChange={(hours) => save({ deadlineHoursBefore: hours })}
            labelledBy={`${id}-d-l ${id}-d-h`}
          />
        </ReminderRow>
      </SettingsItem>

      <SettingsItem>
        <ReminderRow
          id={`${id}-q`}
          icon="bellOff"
          title="Тихие часы"
          sub="Напоминания о дедлайнах придут после их окончания"
          enabled={settings.QuietEnabled}
          onToggle={(next) => save({ quietEnabled: next })}
        >
          <QuietHours id={`${id}-q-time`} from={settings.QuietFrom} to={settings.QuietTo} save={save} />
        </ReminderRow>
      </SettingsItem>
    </>
  )
}

interface ReminderRowProps {
  /** Основа id: подпись — `${id}-l`, пояснение — `${id}-d` */
  id: string
  icon: 'sun' | 'moon' | 'flag' | 'bellOff'
  title: string
  sub: string
  enabled: boolean
  onToggle: (next: boolean) => void
  /** Параметр: показывается только при включённом напоминании, значение при выключении сохраняется */
  children: ReactNode
}

function ReminderRow({ id, icon, title, sub, enabled, onToggle, children }: ReminderRowProps) {
  const labelId = `${id}-l`
  return (
    <SettingsRow
      icon={icon}
      title={title}
      titleId={labelId}
      sub={sub}
      subId={`${id}-d`}
      off={!enabled}
      control={<Switch checked={enabled} onChange={onToggle} labelledBy={labelId} describedBy={`${id}-d`} />}
      extra={children}
    />
  )
}

/** «Во сколько [08:00]»: отправляется по change; пустое значение возвращается к прежнему. */
function ReminderTime({ id, saved, onCommit }: { id: string; saved: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useTimeDraft(saved)
  const ref = useNativeChangeRef((raw) => {
    const value = normalizeTime(raw)
    if (value === null) setDraft(saved)
    else if (value !== saved) onCommit(value)
  })
  return (
    <>
      <SettingsExtraLabel htmlFor={id}>Во сколько</SettingsExtraLabel>
      <SettingsTimeInput
        ref={ref}
        id={id}
        value={draft}
        onChange={setDraft}
        onBlur={() => {
          if (normalizeTime(draft) === null) setDraft(saved)
        }}
      />
    </>
  )
}

/**
 * «С [23:00] до [07:00]» и подсказка. Совпадение концов — ошибка, запрос не отправляется.
 * Если второй конец ждал исправления (был равен первому), он уходит в том же запросе.
 */
function QuietHours({ id, from, to, save }: { id: string; from: string; to: string; save: Save }) {
  const [fromDraft, setFromDraft] = useTimeDraft(from)
  const [toDraft, setToDraft] = useTimeDraft(to)
  const fromValue = normalizeTime(fromDraft) ?? from
  const toValue = normalizeTime(toDraft) ?? to
  const hint = quietHoursHint(fromValue, toValue)
  const hintId = `${id}-h`

  function commit(end: 'from' | 'to', raw: string) {
    const value = normalizeTime(raw)
    const saved = end === 'from' ? from : to
    if (value === null) {
      ;(end === 'from' ? setFromDraft : setToDraft)(saved)
      return
    }
    const other = end === 'from' ? toValue : fromValue
    const otherSaved = end === 'from' ? to : from
    if (value === other) return
    const patch: NotificationSettingsUpdateRequest = end === 'from' ? { quietFrom: value } : { quietTo: value }
    if (other !== otherSaved) Object.assign(patch, end === 'from' ? { quietTo: other } : { quietFrom: other })
    if (value === saved && other === otherSaved) return
    save(patch)
  }

  const fromRef = useNativeChangeRef((raw) => commit('from', raw))
  const toRef = useNativeChangeRef((raw) => commit('to', raw))

  return (
    <>
      <SettingsExtraLabel htmlFor={`${id}-from`}>С</SettingsExtraLabel>
      <SettingsTimeInput
        ref={fromRef}
        id={`${id}-from`}
        value={fromDraft}
        onChange={setFromDraft}
        onBlur={() => {
          if (normalizeTime(fromDraft) === null) setFromDraft(from)
        }}
        invalid={hint.error}
        describedBy={hintId}
      />
      <SettingsExtraLabel htmlFor={`${id}-to`}>до</SettingsExtraLabel>
      <SettingsTimeInput
        ref={toRef}
        id={`${id}-to`}
        value={toDraft}
        onChange={setToDraft}
        onBlur={() => {
          if (normalizeTime(toDraft) === null) setToDraft(to)
        }}
        invalid={hint.error}
        describedBy={hintId}
      />
      <SettingsExtraHint>
        <FieldHint id={hintId} tone={hint.error ? 'error' : 'default'}>
          {hint.text}
        </FieldHint>
      </SettingsExtraHint>
    </>
  )
}

/** Низ карточки: тестовое уведомление на это устройство. */
function TestItem({ pushOn, endpoint, onStale }: { pushOn: boolean; endpoint: string | undefined; onStale: () => void }) {
  const id = useId()
  const { showToast } = useToast()
  const test = useMutation({
    mutationFn: (target: string) => sendTestPush({ userId: CURRENT_USER_ID, endpoint: target }),
    onSuccess: () => showToast({ message: 'Отправили. Уведомление придёт в течение минуты' }),
    onError: (error, target) => {
      if (isStaleSubscriptionError(error)) {
        onStale()
        showToast({ message: 'Подписка устарела — включите уведомления заново' })
        return
      }
      showToast({
        message: `Не удалось отправить: ${errorMessage(error)}`,
        action: { label: 'Повторить', onClick: () => test.mutate(target) },
      })
    },
  })

  return (
    <SettingsItem>
      <SettingsFoot>
        <Button
          variant="secondary"
          disabled={!pushOn || !endpoint}
          loading={test.isPending}
          aria-describedby={`${id}-h`}
          onClick={() => {
            if (endpoint) test.mutate(endpoint)
          }}
        >
          {!test.isPending && <Icon name="send" size="sm" />}
          {test.isPending ? 'Отправляем…' : 'Отправить тестовое уведомление'}
        </Button>
        <FieldHint id={`${id}-h`}>{pushOn ? 'Придёт на это устройство в течение минуты' : 'Сначала включите push-уведомления'}</FieldHint>
      </SettingsFoot>
    </SettingsItem>
  )
}
