import { useState } from 'react'
import { Routes, Route, Link, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import PipelineList from './components/PipelineList'
import RunHistory from './components/RunHistory'
import LogViewer from './components/LogViewer'
import LoginPage from './components/LoginPage'
import MetricsDashboard from './components/MetricsDashboard'

export default function App() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [page, setPage] = useState('pipelines')

  // Not logged in → show LoginPage
  if (!user) return <LoginPage />

  const isPipelinesActive = page === 'pipelines' && (location.pathname === '/' || location.pathname.startsWith('/runs'));

  const navLink = (path, label, pageType) => (
    <Link 
      to={path} 
      onClick={() => setPage(pageType)}
      className={`text-sm ${(pageType === 'metrics' ? page === 'metrics' : page === 'pipelines' && location.pathname === path) ? 'text-white' : 'text-slate-400 hover:text-white'}`}>
      {label}
    </Link>
  )

  const metricsLink = () => (
    <button 
      onClick={() => setPage('metrics')}
      className={`text-sm ${page === 'metrics' ? 'text-white' : 'text-slate-400 hover:text-white'}`}>
      Metrics
    </button>
  )

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <nav className="bg-slate-800 border-b border-slate-700 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center gap-8">
          <span className="text-xl font-bold text-emerald-400">⚡ CI/CD Engine</span>
          {navLink('/', 'Pipelines', 'pipelines')}
          {navLink('/runs', 'Runs', 'pipelines')}
          {metricsLink()}

          {/* Spacer */}
          <div className="ml-auto flex items-center gap-4">
            <span className="text-xs text-slate-400">
              {user.email}
              <span className={`ml-2 px-1.5 py-0.5 rounded text-xs font-medium ${
                user.role === 'admin'
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-slate-600/50 text-slate-300'
              }`}>
                {user.role}
              </span>
            </span>
            <button
              id="logout-btn"
              onClick={logout}
              className="text-xs text-slate-400 hover:text-red-400 transition"
            >
              Sign out
            </button>
          </div>
        </div>
      </nav>
      <div className="max-w-6xl mx-auto px-6 py-8">
        {page === 'metrics' ? (
          <MetricsDashboard />
        ) : (
          <Routes>
            <Route path="/" element={<PipelineList />} />
            <Route path="/runs" element={<RunHistory />} />
            <Route path="/runs/:runId" element={<LogViewer />} />
          </Routes>
        )}
      </div>
    </div>
  )
}
