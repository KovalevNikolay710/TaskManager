import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { ToastProvider } from './components/Toast'
import './styles/tokens.css'
import './styles/global.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Приоритет зависит от времени до дедлайна, поэтому данные считаем устаревшими сразу:
      // списки перезапрашиваются при возврате на вкладку и при переходе между экранами.
      staleTime: 0,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
})

// Service worker (src/sw.ts) — только в сборке, в dev виртуальный модуль ничего не делает.
// autoUpdate: новая версия ставится в фоне и страница перезагружается сама, без диалогов.
// Установленное PWA может неделями не перезагружаться, поэтому обновление проверяется
// и при каждом возврате в приложение.
registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return
    document.addEventListener('visibilitychange', () => {
      // офлайн или сервер недоступен — проверка просто пропускается до следующего раза
      if (document.visibilityState === 'visible') registration.update().catch(() => {})
    })
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <App />
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
