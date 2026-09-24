import { CURRENT_USER_ID } from '../api/user'
import { StubPage } from './StubPage'

/** Экран профиля /profile — заглушка: пользователей и авторизации пока нет. */
export function ProfilePage() {
  return (
    <StubPage
      title="Профиль"
      text={`Сейчас вы работаете как пользователь #${CURRENT_USER_ID}. Профиль и вход появятся вместе с авторизацией.`}
    />
  )
}
