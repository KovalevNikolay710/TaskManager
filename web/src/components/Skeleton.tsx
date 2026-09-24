import type { CSSProperties } from 'react'
import styles from './Skeleton.module.css'

interface SkeletonProps {
  width?: CSSProperties['width']
  height: CSSProperties['height']
  round?: boolean
}

export function Skeleton({ width = '100%', height, round = false }: SkeletonProps) {
  return <div className={styles.skeleton} style={{ width, height, borderRadius: round ? 'var(--radius-full)' : undefined }} />
}

/** Строка-заглушка задачи: чекбокс + две полоски текста. */
export function SkeletonTaskRow({ nameWidth, metaWidth }: { nameWidth: string; metaWidth: string }) {
  return (
    <div className={styles.row}>
      <Skeleton width="var(--size-checkbox)" height="var(--size-checkbox)" />
      <div className={styles.lines}>
        <Skeleton width={nameWidth} height={16} />
        <Skeleton width={metaWidth} height={12} />
      </div>
    </div>
  )
}
