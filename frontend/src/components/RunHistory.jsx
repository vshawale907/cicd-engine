import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

const ICONS  = { success:'✅', failed:'❌', running:'🔄', pending:'⏳' }
const COLORS = { success:'text-emerald-400', failed:'text-red-400', running:'text-blue-400', pending:'text-yellow-400' }

export default function RunHistory() {
  const [runs, setRuns] = useState([])
  const [loading, setLoading] = useState(true)
  const [params] = useSearchParams()
  const pipelineId = params.get('pipelineId')

  useEffect(() => {
    fetchRuns()
    const i = setInterval(fetchRuns, 3000)
    return () => clearInterval(i)
  }, [pipelineId])

  async function fetchRuns() {
    const url = `/api/runs${pipelineId ? `?pipelineId=${pipelineId}` : ''}`
    const res = await fetch(url)
    setRuns(await res.json())
    setLoading(false)
  }

  if (loading) return <p className="text-slate-400 text-center py-20">Loading...</p>

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Run History</h1>
      {runs.length === 0 ? (
        <div className="bg-slate-800 rounded-xl p-12 text-center text-slate-400">No runs yet.</div>
      ) : (
        <div className="space-y-2">
          {runs.map(r => (
            <Link key={r.id} to={`/runs/${r.id}`}
              className="flex items-center justify-between bg-slate-800 rounded-xl p-4 border border-slate-700 hover:border-slate-500 transition">
              <div className="flex items-center gap-3">
                <span>{ICONS[r.status] || '⏳'}</span>
                <div>
                  <span className="font-mono text-sm">{r.repo_name}</span>
                  <span className="text-slate-500 mx-2">·</span>
                  <span className="font-mono text-xs text-slate-400">{r.commit_sha?.slice(0,8)}</span>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className={`text-sm font-semibold ${COLORS[r.status]}`}>{r.status}</span>
                <span className="text-xs text-slate-500">{new Date(r.triggered_at).toLocaleString()}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
