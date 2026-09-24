/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Базовый адрес API; по умолчанию — тот же origin (в dev запросы проксирует Vite) */
  readonly VITE_API_URL?: string
  /** Пользователь, пока нет авторизации; по умолчанию 1 */
  readonly VITE_USER_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
