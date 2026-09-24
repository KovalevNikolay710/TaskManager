import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// Go встраивает web/dist через go:embed, поэтому папка закоммичена с .gitkeep
// (иначе `go build` падает, пока фронтенд не собран). Vite очищает dist перед сборкой —
// возвращаем .gitkeep, чтобы он не пропадал из рабочей копии.
const keepDistPlaceholder: Plugin = {
  name: 'keep-dist-placeholder',
  apply: 'build',
  closeBundle() {
    writeFileSync(resolve(import.meta.dirname, 'dist/.gitkeep'), '')
  },
}

export default defineConfig({
  plugins: [react(), keepDistPlaceholder],
  server: {
    // API под /api, поэтому с маршрутами SPA (/day, /tasks/:id) не пересекается
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
