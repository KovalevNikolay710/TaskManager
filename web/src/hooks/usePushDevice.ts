import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { fetchPushKey, subscribePush, unsubscribePush } from '../api/push'
import { CURRENT_USER_ID } from '../api/user'
import {
  base64UrlToUint8Array,
  isPushSupported,
  pushEnableErrorText,
  resolvePushStatus,
  sameApplicationServerKey,
  toSubscribeRequest,
  type PushEnableStep,
  type PushPermission,
  type PushStatus,
} from '../lib/push'
import { queryKeys } from './queryKeys'

/** Что показывает строка «Push-уведомления» (design/screens/profile.md, «Состояния push»). */
export type PushViewState =
  | { kind: PushStatus }
  /** Разрешение есть, подписка ещё проверяется (доли секунды после открытия экрана) */
  | { kind: 'checking' }
  /** Ждём системный диалог и подписку */
  | { kind: 'pending' }
  | { kind: 'error'; step: PushEnableStep; message: string }

type Transient = { kind: 'pending' } | { kind: 'error'; step: PushEnableStep; message: string }

/** Сколько ждать запуска service worker перед подпиской. В dev-режиме его нет совсем. */
const SW_READY_TIMEOUT_MS = 10_000

function readPermission(): PushPermission {
  return Notification.permission
}

/** Активная регистрация service worker; если он так и не запустился — ошибка ServiceWorkerTimeout. */
async function readyRegistration(): Promise<ServiceWorkerRegistration> {
  let timer = 0
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = window.setTimeout(() => {
      const error = new Error('Service worker не запущен')
      error.name = 'ServiceWorkerTimeout'
      reject(error)
    }, SW_READY_TIMEOUT_MS)
  })
  try {
    return await Promise.race([navigator.serviceWorker.ready, timeout])
  } finally {
    window.clearTimeout(timer)
  }
}

/** Подписка этого браузера или null (service worker не зарегистрирован — подписки тоже нет). */
async function readSubscription(): Promise<PushSubscription | null> {
  try {
    const registration = await navigator.serviceWorker.getRegistration()
    return registration ? await registration.pushManager.getSubscription() : null
  } catch {
    return null
  }
}

interface DeviceState {
  permission: PushPermission
  subscription: PushSubscription | null
}

async function readDeviceState(): Promise<DeviceState> {
  const subscription = await readSubscription()
  return { permission: readPermission(), subscription }
}

function subscribeBody(subscription: PushSubscription) {
  return toSubscribeRequest(subscription.toJSON(), CURRENT_USER_ID, navigator.userAgent)
}

interface UsePushDeviceOptions {
  /** Push только что включён (шаг 5: отправить часовой пояс) */
  onEnabled?: () => void
}

/**
 * Push на этом устройстве: поддержка, разрешение браузера и подписка; включение и выключение.
 * Состояние — свойство устройства, сервер о нём узнаёт через /push/subscribe.
 */
export function usePushDevice({ onEnabled }: UsePushDeviceOptions = {}) {
  const queryClient = useQueryClient()
  const [supported] = useState(() => isPushSupported(window))
  const [permission, setPermission] = useState<PushPermission>(() => (supported ? readPermission() : 'default'))
  const [subscription, setSubscription] = useState<PushSubscription | null>(null)
  const [checked, setChecked] = useState(!supported)
  const [transient, setTransient] = useState<Transient | null>(null)
  // Подписка браузера, которую не удалось сохранить на сервере: «Повторить» повторяет только POST
  const unsavedRef = useRef<PushSubscription | null>(null)
  const busyRef = useRef(false)
  const onEnabledRef = useRef(onEnabled)
  useLayoutEffect(() => {
    onEnabledRef.current = onEnabled
  })

  const apply = useCallback((device: DeviceState) => {
    setPermission(device.permission)
    setSubscription(device.subscription)
    setChecked(true)
  }, [])

  /** Перечитать разрешение и подписку из браузера. */
  const refresh = useCallback(() => {
    if (supported) void readDeviceState().then(apply)
  }, [supported, apply])

  // Открыть экран: проверить состояние; если push включён — молча обновить подписку на сервере
  // (upsert: сервер мог её потерять). Ошибку не показываем — повторится при следующем открытии.
  const upsertedRef = useRef(false)
  useEffect(() => {
    if (!supported) return
    void readDeviceState().then((device) => {
      apply(device)
      if (upsertedRef.current || device.permission !== 'granted' || !device.subscription) return
      upsertedRef.current = true
      const body = subscribeBody(device.subscription)
      if (body) subscribePush(body).catch(() => {})
    })
  }, [supported, apply])

  // Разрешение могли поменять в настройках браузера — перечитываем при изменении и при возврате на вкладку
  useEffect(() => {
    if (!supported) return
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !busyRef.current) refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    let status: PermissionStatus | null = null
    let disposed = false
    const onPermissionChange = () => {
      if (!busyRef.current) refresh()
    }
    navigator.permissions
      ?.query({ name: 'notifications' })
      .then((result) => {
        if (disposed) return
        status = result
        status.addEventListener('change', onPermissionChange)
      })
      .catch(() => {
        // permissions.query для уведомлений есть не везде — хватит visibilitychange
      })
    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', onVisible)
      status?.removeEventListener('change', onPermissionChange)
    }
  }, [supported, refresh])

  const fail = useCallback((step: PushEnableStep, error: unknown) => {
    setTransient({ kind: 'error', step, message: pushEnableErrorText(step, error) })
  }, [])

  /** Шаги 2–5 включения, начиная с указанного. Разрешение уже granted. */
  const subscribeFrom = useCallback(
    async (step: PushEnableStep) => {
      let sub = step === 'server' ? unsavedRef.current : null
      if (!sub) {
        let key: Uint8Array<ArrayBuffer>
        try {
          const { PublicKey } = await queryClient.fetchQuery({ queryKey: queryKeys.pushKey, queryFn: fetchPushKey, staleTime: Infinity })
          key = base64UrlToUint8Array(PublicKey)
        } catch (error) {
          fail('key', error)
          return
        }
        try {
          const registration = await readyRegistration()
          const existing = await registration.pushManager.getSubscription()
          if (existing && sameApplicationServerKey(existing.options.applicationServerKey, key)) {
            sub = existing
          } else {
            // Подписка на старый ключ: с новым ключом subscribe() упадёт, пока её не снять
            if (existing) await existing.unsubscribe()
            sub = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
          }
        } catch (error) {
          fail('subscribe', error)
          return
        }
      }

      const body = subscribeBody(sub)
      if (!body) {
        fail('subscribe', new Error('Браузер вернул подписку без ключей'))
        return
      }
      try {
        await subscribePush(body)
      } catch (error) {
        unsavedRef.current = sub
        fail('server', error)
        return
      }
      unsavedRef.current = null
      setSubscription(sub)
      setTransient(null)
      onEnabledRef.current?.()
    },
    [queryClient, fail],
  )

  const run = useCallback((task: () => Promise<void>) => {
    busyRef.current = true
    setTransient({ kind: 'pending' })
    void task().finally(() => {
      busyRef.current = false
    })
  }, [])

  /**
   * Включить push. Вызывать только из обработчика клика: requestPermission() должен
   * прозвучать синхронно, иначе браузер не покажет диалог.
   */
  const enable = useCallback(() => {
    if (!supported || busyRef.current) return
    let request: Promise<NotificationPermission | undefined>
    try {
      // Promise.resolve: старые браузеры возвращают undefined (вариант с колбэком)
      request = Promise.resolve(Notification.requestPermission())
    } catch (error) {
      fail('subscribe', error)
      return
    }
    run(async () => {
      const result = (await request.catch(() => undefined)) ?? readPermission()
      setPermission(result)
      if (result !== 'granted') {
        // denied → «Заблокированы»; диалог закрыли (default) → «Не включены», без ошибки
        setTransient(null)
        return
      }
      await subscribeFrom('key')
    })
  }, [supported, fail, run, subscribeFrom])

  /** «Повторить» после ошибки: с упавшего шага; если разрешение пропало — заново с запроса. */
  const retry = useCallback(() => {
    if (busyRef.current || transient?.kind !== 'error') return
    if (readPermission() !== 'granted') {
      enable()
      return
    }
    const { step } = transient
    run(() => subscribeFrom(step))
  }, [transient, enable, run, subscribeFrom])

  /** Выключить: снять подписку в браузере сразу, потом удалить на сервере (ошибку не показываем). */
  const disable = useCallback(() => {
    if (busyRef.current) return
    const sub = subscription
    setSubscription(null)
    setTransient(null)
    unsavedRef.current = null
    if (!sub) return
    void (async () => {
      try {
        await sub.unsubscribe()
      } catch {
        // браузер подписку не снял — показываем то, что есть на самом деле
        refresh()
        return
      }
      // Ошибку не показываем: сервер сам удалит подписку, когда push-сервис ответит 404/410
      await unsubscribePush({ userId: CURRENT_USER_ID, endpoint: sub.endpoint }).catch(() => {})
    })()
  }, [subscription, refresh])

  /** Сервер сообщил, что подписки нет или она устарела (тест 404/410): снять её в браузере. */
  const dropStale = useCallback(() => {
    const sub = subscription
    setSubscription(null)
    if (sub) sub.unsubscribe().catch(refresh)
  }, [subscription, refresh])

  /** «Проверить снова» (заблокированы): перечитать разрешение и подписку. */
  const recheck = refresh

  let state: PushViewState
  if (transient?.kind === 'pending') state = transient
  else if (transient?.kind === 'error' && permission === 'granted') state = transient
  else if (supported && permission === 'granted' && !checked) state = { kind: 'checking' }
  else state = { kind: resolvePushStatus({ supported, permission, hasSubscription: subscription !== null }) }

  return { state, subscription, enable, disable, retry, recheck, dropStale }
}
