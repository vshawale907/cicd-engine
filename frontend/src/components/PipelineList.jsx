import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../utils/api'
import { useAuth } from '../context/AuthContext'

const STATUS = {
  success: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  failed:  'bg-red-500/20 text-red-400 border-red-500/30',
  running: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
}

export default function PipelineList() {
  const [pipelines, setPipelines] = useState([])
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()

  useEffect(() => {
    fetchPipelines()
    const i = setInterval(fetchPipelines, 5000)
    return () => clearInterval(i)
  }, [])

  async function fetchPipelines() {
    const res = await apiFetch('/api/pipelines')
    setPipelines(await res.json())
    setLoading(false)
  }

  async function trigger(id) {
    await apiFetch(`/api/pipelines/${id}/trigger`, { method: 'POST' })
    fetchPipelines()
  }

  if (loading) return <p className="text-slate-400 text-center py-20">Loading...</p>

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Pipelines</h1>
      {pipelines.length === 0 ? (
        <div className="bg-slate-800 rounded-xl p-12 text-center text-slate-400">
          No pipelines yet. Configure a GitHub webhook to get started.
        </div>
      ) : (
        <div className="space-y-3">
          {pipelines.map(p => (
            <div key={p.id} className="bg-slate-800 rounded-xl p-5 flex items-center justify-between border border-slate-700">
              <div>
                <div className="font-semibold">{p.repo_name}</div>
                <div className="text-sm text-slate-400 mt-1">
                  {p.branch} · {p.total_runs} runs
                  {p.last_run_at && ` · ${new Date(p.last_run_at).toLocaleString()}`}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {p.last_status && (
                  <span className={`text-xs px-3 py-1 rounded-full border font-medium ${STATUS[p.last_status]}`}>
                    {p.last_status}
                  </span>
                )}
                {/* Only admins can trigger runs */}
                {user?.role === 'admin' && (
                  <button onClick={() => trigger(p.id)}
                    className="text-sm bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded-lg transition">
                    ▶ Run
                  </button>
                )}
                <Link to={`/runs?pipelineId=${p.id}`}
                  className="text-sm bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-lg transition">
                  History
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
