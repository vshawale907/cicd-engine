import { Routes, Route, Link, useLocation } from 'react-router-dom'
import PipelineList from './components/PipelineList'
import RunHistory from './components/RunHistory'
import LogViewer from './components/LogViewer'

export default function App() {
  const location = useLocation()
  const navLink = (path, label) => (
    <Link to={path} className={`text-sm ${location.pathname === path ? 'text-white' : 'text-slate-400 hover:text-white'}`}>
      {label}
    </Link>
  )

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <nav className="bg-slate-800 border-b border-slate-700 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center gap-8">
          <span className="text-xl font-bold text-emerald-400">⚡ CI/CD Engine</span>
          {navLink('/', 'Pipelines')}
          {navLink('/runs', 'Runs')}
        </div>
      </nav>
      <div className="max-w-6xl mx-auto px-6 py-8">
        <Routes>
          <Route path="/" element={<PipelineList />} />
          <Route path="/runs" element={<RunHistory />} />
          <Route path="/runs/:runId" element={<LogViewer />} />
        </Routes>
      </div>
    </div>
  )
}
