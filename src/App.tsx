import { useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { Sidebar } from '@/components/Sidebar'
import { useAppStore } from '@/store/useAppStore'
import Stats from '@/pages/Stats'
import Submissions from '@/pages/Submissions'
import Settings from '@/pages/Settings'

export default function App() {
  const refresh = useAppStore((s) => s.refresh)

  useEffect(() => {
    refresh()
  }, [refresh])

  return (
    <Router>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="min-w-0 flex-1 px-6 py-8 lg:px-10 lg:py-10">
          <div className="mx-auto max-w-6xl">
            <Routes>
              <Route path="/" element={<Navigate to="/stats" replace />} />
              <Route path="/stats" element={<Stats />} />
              <Route path="/submissions" element={<Submissions />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/stats" replace />} />
            </Routes>
          </div>
        </main>
      </div>
    </Router>
  )
}
