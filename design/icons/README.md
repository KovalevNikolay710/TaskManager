# Иконки и манифест PWA

| Файл | Назначение | `purpose` в манифесте |
|---|---|---|
| `icon.svg` | обычная иконка: скруглённый квадрат цвета акцента, белый список «по приоритету» (строки укорачиваются сверху вниз, первая отмечена) | `any` |
| `icon-maskable.svg` | то же на квадрате без скруглений, рисунок уменьшен до 86% и целиком лежит в безопасной зоне (круг диаметром 80%). Форму (круг, «капля», скруглённый квадрат) задаёт лаунчер Android | `maskable` |
| `badge.svg` | монохромный значок уведомления для строки состояния Android (`badge` в `showNotification`). Система берёт только альфа-канал | — (не в манифесте) |

Идея иконки — главная мысль продукта: список, уже отсортированный по приоритету. Строки укорачиваются сверху вниз, а кружок первой отмечен: важное сделано первым. Рисунок перекликается с иконкой навигации «Все задачи» (`list-checks`) и с нынешним `web/public/favicon.svg`. Favicon стоит заменить на `icon.svg`: на вкладке браузера будет та же иконка, что на домашнем экране.

## Что сделать разработчику

1. **PNG.** Chrome на Android ставит WebAPK по PNG-иконкам, SVG в манифесте он использует не везде. Нужно сгенерировать из этих SVG (например, `@vite-pwa/assets-generator` или `sharp` при сборке) и положить в `web/public/icons/`:
   - `icon-192.png`, `icon-512.png` — из `icon.svg`;
   - `icon-maskable-192.png`, `icon-maskable-512.png` — из `icon-maskable.svg`;
   - `apple-touch-icon-180.png` — из `icon-maskable.svg` (iOS скругляет углы сам, прозрачность не допускается);
   - `badge-96.png` — из `badge.svg`, белый на прозрачном.
   SVG тоже положить в `web/public/icons/` и указать в манифесте с `"sizes": "any"` — его используют десктопные браузеры.
2. **Проверка maskable**: https://maskable.app — у всех форм рисунок не должен обрезаться.

## Манифест (`web/public/manifest.webmanifest`)

```json
{
  "id": "/",
  "name": "TaskManager — задачи по приоритету",
  "short_name": "TaskManager",
  "description": "Личные задачи, отсортированные по приоритету, и план на день",
  "lang": "ru",
  "dir": "ltr",
  "start_url": "/day",
  "scope": "/",
  "display": "standalone",
  "theme_color": "#f4f5f8",
  "background_color": "#f4f5f8",
  "icons": [
    { "src": "/icons/icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any" },
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-maskable-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
    { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ],
  "shortcuts": [
    { "name": "Быстрая задача", "short_name": "Задача", "url": "/all-tasks?quick=1", "icons": [{ "src": "/icons/icon-192.png", "sizes": "192x192" }] },
    { "name": "План на день", "short_name": "День", "url": "/day", "icons": [{ "src": "/icons/icon-192.png", "sizes": "192x192" }] }
  ]
}
```

### Цвета (из `design/tokens.css`)

| Поле | Значение | Токен | Почему |
|---|---|---|---|
| `theme_color` | `#f4f5f8` | `--color-bg` (светлая тема) | строка состояния и заголовок окна сливаются с `AppHeader`, у которого фон тоже `--color-bg`: приложение выглядит «на весь экран», без цветной полосы сверху |
| `background_color` | `#f4f5f8` | `--color-bg` (светлая тема) | заставка при запуске того же цвета, что и первый экран: при загрузке нет вспышки |
| цвет иконки | `#4c4fd8` | `--color-accent` (светлая тема) | на домашнем экране иконка узнаётся по акценту, внутри приложения акцент — цвет действий |

Тёмная тема. В манифесте одно значение `theme_color`, поэтому в `web/index.html` его переопределяют мета-теги (Chrome их учитывает и в установленном PWA):

```html
<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#f4f5f8" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#111318" media="(prefers-color-scheme: dark)">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon-180.png">
<meta name="apple-mobile-web-app-title" content="TaskManager">
```

`#111318` — `--color-bg` тёмной темы. Если пользователь включит тему вручную (`data-theme`), фронт меняет `content` у `meta[name="theme-color"]` на `--color-bg` выбранной темы.
Заставка на Android всегда использует `background_color` из манифеста. В тёмной теме системы она будет светлой долю секунды — ограничение платформы.

### Название

| Поле | Значение | Где видно |
|---|---|---|
| `name` | «TaskManager — задачи по приоритету» | диалог установки, заставка, список приложений |
| `short_name` | «TaskManager» (11 символов) | подпись под иконкой на домашнем экране (помещается до ~12 символов) |

Альтернатива для `short_name` — «Задачи»: по-русски, как весь интерфейс, но не совпадает с названием в `SideNav` и в заголовке вкладки. Решение — за пользователем.

### Ярлыки (`shortcuts`)
Долгое нажатие на иконку на Android показывает:
- «Быстрая задача» → `/all-tasks?quick=1`: экран «Все задачи» сразу с открытым листом (`design/screens/quick-add.md`);
- «План на день» → `/day`.

### Уведомления
В `showNotification` в service worker: `icon: '/icons/icon-192.png'`, `badge: '/icons/badge-96.png'`, `lang: 'ru'`. Тексты уведомлений и правила — в `design/screens/profile.md`.
