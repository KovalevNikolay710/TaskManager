import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ApiError } from '../api/client'
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

/** Публичный ключ меняется только вместе с ключами сервера; минут кэша хватает, чтобы не запрашивать на каждый повтор */
const PUSH_KEY_STALE_MS = 5 * 60_000

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
  // Включение, выключение и снятие устаревшей подписки идут строго по очереди (одна цепочка promise):
  // иначе выключение может снять подписку, которую только что оформило включение.
  const queueRef = useRef<Promise<void>>(Promise.resolve())
  /** Сколько операций в очереди или выполняется; пока > 0, внешние события состояние не перечитывают */
  const busyRef = useRef(0)
  /** Включение уже идёт — повторные клики игнорируются */
  const enablingRef = useRef(false)
  // Поколение чтения: применяется только результат последнего чтения, начатого после последней операции
  const readGenRef = useRef(0)
  const onEnabledRef = useRef(onEnabled)
  useLayoutEffect(() => {
    onEnabledRef.current = onEnabled
  })

  const apply = useCallback((device: DeviceState) => {
    setPermission(device.permission)
    setSubscription(device.subscription)
    setChecked(true)
  }, [])

  /** Перечитать разрешение и подписку из браузера; устаревший результат отбрасывается. */
  const read = useCallback(async (): Promise<DeviceState | null> => {
    const gen = ++readGenRef.current
    const device = await readDeviceState()
    if (gen !== readGenRef.current) return null
    apply(device)
    return device
  }, [apply])

  const refresh = useCallback(() => {
    if (supported) void read()
  }, [supported, read])

  // Открыть экран: проверить состояние; если push включён — молча обновить подписку на сервере
  // (upsert: сервер мог её потерять). Ошибку не показываем — повторится при следующем открытии.
  const upsertedRef = useRef(false)
  useEffect(() => {
    if (!supported) return
    void read().then((device) => {
      if (!device || upsertedRef.current || device.permission !== 'granted' || !device.subscription) return
      upsertedRef.current = true
      const body = subscribeBody(device.subscription)
      if (body) subscribePush(body).catch(() => {})
    })
  }, [supported, read])

  // Разрешение могли поменять в настройках браузера — перечитываем при изменении и при возврате на вкладку.
  // Во время операции не читаем: по её завершении состояние перечитывается всё равно (см. enqueue).
  useEffect(() => {
    if (!supported) return
    const onVisible = () => {
      if (document.visibilityState === 'visible' && busyRef.current === 0) refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    let status: PermissionStatus | null = null
    let disposed = false
    const onPermissionChange = () => {
      if (busyRef.current === 0) refresh()
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

  /**
   * Поставить операцию в очередь. Чтения, начатые до неё, отбрасываются; после последней
   * операции в очереди состояние перечитывается из браузера. Ошибка операции не рвёт очередь,
   * но возвращается вызывающему.
   */
  const enqueue = useCallback(
    (task: () => Promise<void>): Promise<void> => {
      busyRef.current += 1
      readGenRef.current += 1
      const result = queueRef.current.then(task).finally(() => {
        busyRef.current -= 1
        if (busyRef.current === 0) refresh()
      })
      queueRef.current = result.catch(() => {
        // ошибку получает тот, кто ставил операцию; очередь идёт дальше
      })
      return result
    },
    [refresh],
  )

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
          const { PublicKey } = await queryClient.fetchQuery({ queryKey: queryKeys.pushKey, queryFn: fetchPushKey, staleTime: PUSH_KEY_STALE_MS })
          if (typeof PublicKey !== 'string') throw new Error('В ответе нет ключа')
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

  /** Включение (или повтор) в очереди: «Запрос разрешения», пока не закончится; pending не залипает. */
  const run = useCallback(
    (task: () => Promise<void>) => {
      enablingRef.current = true
      setTransient({ kind: 'pending' })
      void enqueue(async () => {
        try {
          await task()
        } catch (error) {
          fail('subscribe', error)
        } finally {
          enablingRef.current = false
        }
      })
    },
    [enqueue, fail],
  )

  /**
   * Включить push. Вызывать только из обработчика клика: requestPermission() должен
   * прозвучать синхронно, иначе браузер не покажет диалог.
   */
  const enable = useCallback(() => {
    if (!supported || enablingRef.current) return
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
    if (enablingRef.current || transient?.kind !== 'error') return
    if (readPermission() !== 'granted') {
      enable()
      return
    }
    const { step } = transient
    run(() => subscribeFrom(step))
  }, [transient, enable, run, subscribeFrom])

  /** Выключить: сразу «Не включены»; в очереди — снять подписку в браузере, потом удалить на сервере. */
  const disable = useCallback(() => {
    setSubscription(null)
    setTransient(null)
    unsavedRef.current = null
    void enqueue(async () => {
      // Подписку берём из браузера, а не из состояния: к этому моменту её могла сменить предыдущая операция
      const sub = await readSubscription()
      if (!sub) return
      try {
        await sub.unsubscribe()
      } catch {
        // браузер подписку не снял — после операции состояние перечитается и покажет, как есть на самом деле
        return
      }
      try {
        await unsubscribePush({ userId: CURRENT_USER_ID, endpoint: sub.endpoint })
      } catch (error) {
        // Сеть недоступна — не страшно: сервер сам удалит подписку, когда push-сервис ответит 404/410.
        // Остальные ошибки не глушим (уйдут в консоль как необработанные), но пользователю не показываем.
        if (!(error instanceof ApiError && error.status === 0)) throw error
      }
    })
  }, [enqueue])

  /** Сервер сообщил, что подписки нет или она устарела (тест 404/410): снять её в браузере. */
  const dropStale = useCallback(() => {
    setSubscription(null)
    void enqueue(async () => {
      const sub = await readSubscription()
      // не снялась — после операции состояние перечитается
      await sub?.unsubscribe().catch(() => false)
    })
  }, [enqueue])

  /** «Проверить снова» (заблокированы): перечитать разрешение и подписку. */
  const recheck = refresh

  let state: PushViewState
  if (transient?.kind === 'pending') state = transient
  else if (transient?.kind === 'error' && permission === 'granted') state = transient
  else if (supported && permission === 'granted' && !checked) state = { kind: 'checking' }
  else state = { kind: resolvePushStatus({ supported, permission, hasSubscription: subscription !== null }) }

  return { state, subscription, enable, disable, retry, recheck, dropStale }
}
