import { Navigate, Route, Routes } from 'react-router-dom'
import { NewTaskPage } from './pages/NewTaskPage'
import { ProfilePage } from './pages/ProfilePage'
import { TaskPage } from './pages/TaskPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/profile" replace />} />
      <Route path="/tasks/new" element={<NewTaskPage />} />
      <Route path="/tasks/:taskId" element={<TaskPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="*" element={<Navigate to="/profile" replace />} />
    </Routes>
  )
}
