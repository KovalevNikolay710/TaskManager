import { Navigate, Route, Routes } from 'react-router-dom'
import { AllTasksPage } from './pages/AllTasksPage'
import { DayPage } from './pages/DayPage'
import { NewTaskPage } from './pages/NewTaskPage'
import { ProfilePage } from './pages/ProfilePage'
import { TaskPage } from './pages/TaskPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/day" replace />} />
      <Route path="/day" element={<DayPage />} />
      <Route path="/all-tasks" element={<AllTasksPage />} />
      <Route path="/tasks/new" element={<NewTaskPage />} />
      <Route path="/tasks/:taskId" element={<TaskPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="*" element={<Navigate to="/day" replace />} />
    </Routes>
  )
}
