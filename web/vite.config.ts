import react from '@vitejs/plugin-react'
import { defineConfig, type ProxyOptions } from 'vite'

const API_TARGET = 'http://localhost:8080'

// Пути SPA (например, /tasks/:id — экран задачи) пересекаются с путями API.
// Переходы браузера (Accept: text/html) отдаём фронтенду, остальные запросы — Go-серверу.
const apiProxy: ProxyOptions = {
  target: API_TARGET,
  changeOrigin: true,
  bypass(req) {
    if (req.method === 'GET' && req.headers.accept?.includes('text/html')) {
      return '/index.html'
    }
  },
}

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/tasks': apiProxy,
      '/groups': apiProxy,
      '/days': apiProxy,
    },
  },
})
