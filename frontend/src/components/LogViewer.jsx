import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { apiFetch } from '../utils/api'
import { useAuth } from '../context/AuthContext'

export default function LogViewer() {
  const { runId } = useParams()
  const { token } = useAuth()
  const [run, setRun] = useState(null)
  const [logs, setLogs] = useState([])
  const [done, setDone] = useState(false)
  const wsRef = useRef(null)
  const bottomRef = useRef(null)

  // Auto-scroll to bottom as new lines arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  useEffect(() => {
    loadRun()
    openWebSocket()
    return () => wsRef.current?.close()
  }, [runId, token])

  async function loadRun() {
    const res = await apiFetch(`/api/runs/${runId}`)
    const data = await res.json()
    setRun(data)

    // If already finished, load logs from DB (no need for live stream)
    if (data.status === 'success' || data.status === 'failed') {
      setDone(true)
      const logsRes = await apiFetch(`/api/runs/${runId}/logs`)
      const logsData = await logsRes.json()
      setLogs(logsData.map(l => l.line))
    }
  }

  function openWebSocket() {
    if (!token) return
    
    // Pass token as query param — backend verifies it on connection
    const WS_URL = import.meta.env.VITE_WS_URL || `ws://${window.location.host}/ws`
    const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`)
    wsRef.current = ws

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'subscribe', runId: parseInt(runId) }))
    }

    ws.onmessage = (e) => {
      const data = JSON.parse(e.data)
      if (data.type === 'subscribed') return

      if (data.line === '__PIPELINE_DONE__') {
        setDone(true)
        loadRun() // refresh final status
        return
      }

      if (data.line) setLogs(prev => [...prev, data.line])
    }
  }

  const COLOR = { success:'text-emerald-400', failed:'text-red-400', running:'text-blue-400', pending:'text-yellow-400' }

  function lineColor(line) {
    if (line.includes('❌') || line.includes('[stderr]')) return 'text-red-400'
    if (line.includes('✅') || line.includes('PASSED'))   return 'text-emerald-400'
    if (line.includes('🚀') || line.includes('▶️'))       return 'text-blue-400'
    if (line.includes('📦') || line.includes('📋'))       return 'text-yellow-400'
    return 'text-slate-300'
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link to="/runs" className="text-slate-400 hover:text-white text-sm">← Runs</Link>
        <span className="text-slate-600">·</span>
        <span className="text-slate-400 text-sm">Run #{runId}</span>
        {run && <span className={`text-sm font-semibold ${COLOR[run.status]}`}>{run.status}</span>}
      </div>

      {run && (
        <div className="bg-slate-800 rounded-xl p-4 mb-4 border border-slate-700 flex flex-wrap gap-6 text-sm">
          <span><span className="text-slate-400">Repo: </span>{run.repo_name}</span>
          <span><span className="text-slate-400">Commit: </span><code>{run.commit_sha?.slice(0,8)}</code></span>
          <span><span className="text-slate-400">Triggered: </span>{new Date(run.triggered_at).toLocaleString()}</span>
          <span className="ml-auto">
            {!done
              ? <span className="text-blue-400 animate-pulse">● Live</span>
              : <span className="text-slate-500">Stream ended</span>
            }
          </span>
        </div>
      )}

      {/* Terminal */}
      <div className="bg-slate-950 rounded-xl border border-slate-700 p-5 font-mono text-sm h-[500px] overflow-y-auto">
        {logs.length === 0 && !done && (
          <p className="text-slate-500 animate-pulse">Waiting for logs...</p>
        )}
        {logs.map((line, i) => (
          <div key={i} className={`leading-6 ${lineColor(line)}`}>{line}</div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
