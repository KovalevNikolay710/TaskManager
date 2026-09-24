const BASE_URL = import.meta.env.VITE_API_URL ?? ''

/** Ошибка API: текст из {"error": "..."} и HTTP-статус (0 — сервер недоступен). */
export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST'
  body?: unknown
}

export async function request<T>(path: string, { method = 'GET', body }: RequestOptions = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(BASE_URL + path, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError('Не удалось связаться с сервером', 0)
  }

  const text = await response.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }

  if (!response.ok) {
    throw new ApiError(extractError(data) ?? `Ошибка сервера (${response.status})`, response.status)
  }
  return data as T
}

function extractError(data: unknown): string | null {
  if (data && typeof data === 'object' && 'error' in data) {
    const error = (data as { error: unknown }).error
    // Часть обработчиков кладёт в error объект ошибки валидации, а не строку
    return typeof error === 'string' ? error : JSON.stringify(error)
  }
  return typeof data === 'string' && data ? data : null
}
