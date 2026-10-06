// Форматы из design/system.md → «Форматы».

/** Выбор формы слова по числу: plural(3, ['задача', 'задачи', 'задач']) → 'задачи'. */
export function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100
  const last = abs % 10
  if (abs > 10 && abs < 20) return forms[2]
  if (last === 1) return forms[0]
  if (last >= 2 && last <= 4) return forms[1]
  return forms[2]
}

/** Длительность в минутах → «Ч:ММ»: 150 → «2:30», 45 → «0:45». */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes))
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

/** Длительность словами для скринридеров: 150 → «2 часа 30 минут». */
export function durationToWords(minutes: number): string {
  const total = Math.max(0, Math.round(minutes))
  const h = Math.floor(total / 60)
  const m = total % 60
  const parts: string[] = []
  if (h > 0) parts.push(`${h} ${plural(h, ['час', 'часа', 'часов'])}`)
  if (m > 0 || h === 0) parts.push(`${m} ${plural(m, ['минута', 'минуты', 'минут'])}`)
  return parts.join(' ')
}

/**
 * Разбор ввода длительности (TimeInput): «2:30» → 150, «2» → 120, «230» → 150.
 * Возвращает null, если ввод не распознан.
 */
export function parseDuration(input: string): number | null {
  const value = input.trim()
  if (!value) return null

  const withColon = /^(\d{1,2}):(\d{1,2})$/.exec(value)
  if (withColon) {
    const minutes = Number(withColon[2])
    if (minutes > 59) return null
    return Number(withColon[1]) * 60 + minutes
  }

  if (!/^\d{1,4}$/.test(value)) return null
  if (value.length <= 2) return Number(value) * 60
  const minutes = Number(value.slice(-2))
  if (minutes > 59) return null
  return Number(value.slice(0, -2)) * 60 + minutes
}

/** Число приоритета: один знак после запятой, «<0,1» для совсем малых. */
export function formatPriority(priority: number): string {
  if (priority > 0 && priority < 0.1) return '<0,1'
  return priority.toFixed(1).replace('.', ',')
}
