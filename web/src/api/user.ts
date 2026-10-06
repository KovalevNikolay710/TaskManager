// Авторизации пока нет: userId передаётся в запросах явно и хранится только здесь.
export const CURRENT_USER_ID = Number(import.meta.env.VITE_USER_ID) || 1
