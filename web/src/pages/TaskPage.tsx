import { useParams } from 'react-router-dom'
import { useTasks } from '../hooks/useTasks'
import { StubPage } from './StubPage'

/** Экран задачи /tasks/:taskId — заглушка до макета. */
export function TaskPage() {
  const { taskId } = useParams()
  const { data: tasks } = useTasks()
  const task = tasks?.find((t) => String(t.TaskId) === taskId)
  return (
    <StubPage
      title="Задача"
      text={
        <>
          {task ? `«${task.Name}». ` : ''}
          Здесь будут описание, прогресс и редактирование задачи — макет экрана ещё не готов.
        </>
      }
    />
  )
}
