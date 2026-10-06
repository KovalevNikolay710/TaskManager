import { cx } from '../lib/cx'
import { weightClass } from '../lib/weight'
import styles from './WeightTile.module.css'

/**
 * WeightTile: квадрат «×3» в цветах ступени веса; base — нейтральный вариант для «Без группы».
 * Сейчас на экранах не используется (строки групп заменены лесенкой) — оставлен для компактных списков групп.
 */
export function WeightTile({ weight, base = false }: { weight: number; base?: boolean }) {
  return (
    <span className={cx(styles.tile, base ? styles.base : weightClass(weight))} aria-hidden="true">
      ×{weight}
    </span>
  )
}
