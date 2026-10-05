/// <reference types="vitest/config" />
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

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

// PWA: манифест и service worker (src/sw.ts). Значения — из design/icons/README.md.
// Иконки лежат готовыми PNG в public/icons (сгенерированы из design/icons/*.svg один раз),
// сборка их не генерирует.
const pwa = VitePWA({
  strategies: 'injectManifest',
  srcDir: 'src',
  filename: 'sw.ts',
  registerType: 'autoUpdate',
  // регистрация — вручную через virtual:pwa-register в main.tsx
  injectRegister: false,
  // иконки уже попадают в precache по globPatterns, без этого они бы дублировались
  includeManifestIcons: false,
  injectManifest: {
    globPatterns: ['**/*.{js,css,html,svg,png}'],
  },
  manifest: {
    id: '/',
    name: 'TaskManager — задачи по приоритету',
    short_name: 'TaskManager',
    description: 'Личные задачи, отсортированные по приоритету, и план на день',
    lang: 'ru',
    dir: 'ltr',
    // '/', а не '/day': адрес запуска стабилен вместе с id '/', переживёт смену главного экрана,
    // а на /day App редиректит сам
    start_url: '/',
    scope: '/',
    display: 'standalone',
    // --color-bg светлой темы; тёмную задают мета-теги theme-color в index.html
    theme_color: '#f4f5f8',
    background_color: '#f4f5f8',
    icons: [
      { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      {
        name: 'Быстрая задача',
        short_name: 'Задача',
        url: '/all-tasks?quick=1',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'План на день',
        short_name: 'День',
        url: '/day',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
    ],
  },
})

export default defineConfig({
  plugins: [react(), pwa, keepDistPlaceholder],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
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
