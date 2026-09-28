import { GROUP_WEIGHT_MAX, GROUP_WEIGHT_MIN } from './groups'

/** Вес, ограниченный шкалой 1–10: у старых групп он может быть больше 10 — показываем как ×10. */
export function clampWeight(weight: number): number {
  return Math.min(GROUP_WEIGHT_MAX, Math.max(GROUP_WEIGHT_MIN, Math.round(weight) || GROUP_WEIGHT_MIN))
}

/** Глобальный класс ступени веса (.w-N в styles/global.css): задаёт --w, --w-soft, --w-text. */
export function weightClass(weight: number): string {
  return `w-${clampWeight(weight)}`
}
