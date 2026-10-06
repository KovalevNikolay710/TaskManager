import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppHeader } from '../components/AppHeader'
import { AppShell } from '../components/AppShell'
import { Button } from '../components/Button'
import { Icon } from '../components/Icon'
import { StateMessage } from '../components/StateMessage'

interface StubPageProps {
  title: string
  text: ReactNode
}

/** Заглушка для экранов, макеты которых ещё не нарисованы. */
export function StubPage({ title, text }: StubPageProps) {
  const navigate = useNavigate()
  return (
    <AppShell>
      <AppHeader title={title} />
      <StateMessage icon="inbox" title="Экран в разработке" text={text}>
        <Button variant="secondary" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/day'))}>
          <Icon name="chevronLeft" size="sm" />
          Назад
        </Button>
      </StateMessage>
    </AppShell>
  )
}
