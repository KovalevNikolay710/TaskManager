import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/client'
import {
  PUSH_NETWORK_ERROR_TEXT,
  base64UrlToUint8Array,
  isPushSupported,
  isStaleSubscriptionError,
  pushEnableErrorText,
  resolvePushStatus,
  sameApplicationServerKey,
  toSubscribeRequest,
  type PushPermission,
} from './push'

describe('resolvePushStatus', () => {
  it.each<[boolean, PushPermission, boolean, string]>([
    [false, 'granted', true, 'unsupported'],
    [false, 'default', false, 'unsupported'],
    [true, 'denied', false, 'denied'],
    [true, 'denied', true, 'denied'],
    [true, 'granted', true, 'on'],
    [true, 'granted', false, 'off'],
    [true, 'default', false, 'off'],
    [true, 'default', true, 'off'],
  ])('support=%s permission=%s subscription=%s → %s', (supported, permission, hasSubscription, expected) => {
    expect(resolvePushStatus({ supported, permission, hasSubscription })).toBe(expected)
  })
})

describe('isPushSupported', () => {
  it('нужны serviceWorker, PushManager и Notification', () => {
    expect(isPushSupported({ navigator: { serviceWorker: {} }, PushManager: class {}, Notification: class {} })).toBe(true)
  })

  it.each([
    ['нет serviceWorker', { navigator: {}, PushManager: class {}, Notification: class {} }],
    ['нет PushManager', { navigator: { serviceWorker: {} }, Notification: class {} }],
    ['нет Notification', { navigator: { serviceWorker: {} }, PushManager: class {} }],
    ['нет navigator', { PushManager: class {}, Notification: class {} }],
  ])('%s → не поддерживается', (_name, globals) => {
    expect(isPushSupported(globals)).toBe(false)
  })
})

describe('base64UrlToUint8Array', () => {
  it('декодирует base64url без паддинга', () => {
    // «-» и «_» вместо «+» и «/», паддинг «=» снят
    expect([...base64UrlToUint8Array('-_8')]).toEqual([0xfb, 0xff])
    expect([...base64UrlToUint8Array('AQID')]).toEqual([1, 2, 3])
    expect([...base64UrlToUint8Array('AQIDBA')]).toEqual([1, 2, 3, 4])
  })

  it('VAPID-ключ — 65 байт, первый 0x04 (несжатая точка P-256)', () => {
    const key = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U'
    const bytes = base64UrlToUint8Array(key)
    expect(bytes).toHaveLength(65)
    expect(bytes[0]).toBe(4)
  })

  it.each([[''], ['A'], ['!!!'], ['AQ ID'], ['AQID===']])('невалидная строка «%s» — ошибка', (value) => {
    expect(() => base64UrlToUint8Array(value)).toThrow()
  })

  it('обычный base64 с паддингом тоже понимает', () => {
    expect([...base64UrlToUint8Array('AQIDBA==')]).toEqual([1, 2, 3, 4])
  })
})

describe('sameApplicationServerKey', () => {
  const key = new Uint8Array([4, 1, 2, 3])

  it('совпадает побайтно', () => {
    expect(sameApplicationServerKey(new Uint8Array([4, 1, 2, 3]).buffer, key)).toBe(true)
  })

  it('другой ключ или другая длина — не совпадает', () => {
    expect(sameApplicationServerKey(new Uint8Array([4, 1, 2, 9]).buffer, key)).toBe(false)
    expect(sameApplicationServerKey(new Uint8Array([4, 1, 2]).buffer, key)).toBe(false)
  })

  it('браузер ключ не сообщил — считаем другим (переподписка)', () => {
    expect(sameApplicationServerKey(null, key)).toBe(false)
    expect(sameApplicationServerKey(undefined, key)).toBe(false)
  })
})

describe('toSubscribeRequest', () => {
  it('subscription.toJSON() + userId и userAgent', () => {
    expect(
      toSubscribeRequest({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'BN', auth: 'k8' } }, 1, 'UA'),
    ).toEqual({ userId: 1, endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'BN', auth: 'k8' }, userAgent: 'UA' })
  })

  it('без endpoint или ключей — null', () => {
    expect(toSubscribeRequest({ keys: { p256dh: 'BN', auth: 'k8' } }, 1, 'UA')).toBeNull()
    expect(toSubscribeRequest({ endpoint: 'https://x', keys: { p256dh: 'BN' } }, 1, 'UA')).toBeNull()
    expect(toSubscribeRequest({ endpoint: 'https://x' }, 1, 'UA')).toBeNull()
  })
})

describe('pushEnableErrorText', () => {
  it('сеть — «Сервер не ответил…»', () => {
    expect(pushEnableErrorText('key', new ApiError('Не удалось связаться с сервером', 0))).toBe(PUSH_NETWORK_ERROR_TEXT)
    expect(pushEnableErrorText('server', new ApiError('Не удалось связаться с сервером', 0))).toBe(PUSH_NETWORK_ERROR_TEXT)
  })

  it('ответ сервера с ошибкой — его текст', () => {
    expect(pushEnableErrorText('server', new ApiError('Неверная подписка', 400))).toBe('Неверная подписка')
  })

  it('ключ не разобрался', () => {
    expect(pushEnableErrorText('key', new DOMException('bad', 'InvalidCharacterError'))).toBe('Сервер прислал неверный ключ уведомлений.')
  })

  it('ошибки pushManager.subscribe — по имени', () => {
    expect(pushEnableErrorText('subscribe', { name: 'NotAllowedError' })).toMatch(/не разрешил/)
    expect(pushEnableErrorText('subscribe', { name: 'ServiceWorkerTimeout' })).toMatch(/Обновите страницу/)
    expect(pushEnableErrorText('subscribe', { name: 'AbortError' })).toMatch(/push-сервис недоступен/)
  })
})

describe('isStaleSubscriptionError', () => {
  it('404 и 410 — подписка потеряна или устарела', () => {
    expect(isStaleSubscriptionError(new ApiError('Подписка не найдена', 404))).toBe(true)
    expect(isStaleSubscriptionError(new ApiError('Подписка устарела', 410))).toBe(true)
    expect(isStaleSubscriptionError(new ApiError('Ошибка', 500))).toBe(false)
    expect(isStaleSubscriptionError(new Error('x'))).toBe(false)
  })
})
