import { AvatarCircle } from './AvatarButton'
import styles from './ProfileCard.module.css'

/** ProfileCard: аватар 48px, имя и подпись. Профиля и входа пока нет. */
export function ProfileCard({ name, sub }: { name: string; sub: string }) {
  return (
    <div className={styles.card}>
      <span className={styles.avatarWrap} aria-hidden="true">
        <AvatarCircle className={styles.avatar} />
      </span>
      <div>
        <span className={styles.name}>{name}</span>
        <span className={styles.sub}>{sub}</span>
      </div>
    </div>
  )
}
