import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../utils/api'

const STATUS = {
  success: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  failed:  'bg-red-500/20 text-red-400 border-red-500/30',
  running: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
}

export default function GitHubIntegration() {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState(null)

  const [connectedRepos, setConnectedRepos] = useState([])
  const [availableRepos, setAvailableRepos] = useState([])
  const [loadingRepos, setLoadingRepos] = useState(false)
  const [showRepoSelector, setShowRepoSelector] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [connectingRepoId, setConnectingRepoId] = useState(null)
  const [disconnectingRepoId, setDisconnectingRepoId] = useState(null)

  useEffect(() => {
    loadStatusAndConnected()
  }, [])

  async function loadStatusAndConnected() {
    setLoading(true)
    setError(null)
    try {
      const [statusRes, connectedRes] = await Promise.all([
        apiFetch('/api/github/status'),
        apiFetch('/api/github/connected-repos'),
      ])

      if (statusRes.ok) {
        const statusData = await statusRes.json()
        setStatus(statusData)
      }

      if (connectedRes.ok) {
        const connectedData = await connectedRes.json()
        setConnectedRepos(connectedData)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleConnectGitHub() {
    setConnecting(true)
    setError(null)
    try {
      const res = await apiFetch('/api/github/auth-url')
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to get GitHub authorization URL')
      }

      window.location.href = data.url
    } catch (err) {
      setError(err.message)
      setConnecting(false)
    }
  }

  async function handleDisconnectGitHub() {
    if (!window.confirm('Disconnecting GitHub will un-link all connected repositories. Continue?')) {
      return
    }

    try {
      const res = await apiFetch('/api/github/disconnect', { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Disconnect failed')
      }
      setStatus({ connected: false })
      setConnectedRepos([])
      setShowRepoSelector(false)
    } catch (err) {
      setError(err.message)
    }
  }

  async function fetchAvailableRepos() {
    setLoadingRepos(true)
    setError(null)
    try {
      const res = await apiFetch('/api/github/repos')
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch repositories')
      }

      setAvailableRepos(data)
      setShowRepoSelector(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingRepos(false)
    }
  }

  async function handleConnectRepo(repo) {
    setConnectingRepoId(repo.id)
    setError(null)
    try {
      const res = await apiFetch(`/api/github/repos/${repo.id}/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: repo.owner,
          name: repo.name,
          full_name: repo.full_name,
          clone_url: repo.clone_url,
          default_branch: repo.default_branch,
          private: repo.private,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to connect repository')
      }

      if (data.webhookWarning) {
        alert(`Note: ${data.webhookWarning}`)
      }

      setAvailableRepos(prev =>
        prev.map(r => (r.id === repo.id ? { ...r, connected: true } : r))
      )
      loadStatusAndConnected()
    } catch (err) {
      setError(err.message)
    } finally {
      setConnectingRepoId(null)
    }
  }

  async function handleDisconnectRepo(repo) {
    const repoGithubId = repo.github_repo_id || repo.id
    setDisconnectingRepoId(repoGithubId)
    setError(null)
    try {
      const res = await apiFetch(`/api/github/repos/${repoGithubId}/disconnect`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to disconnect repository')
      }

      setAvailableRepos(prev =>
        prev.map(r => (r.id === repoGithubId ? { ...r, connected: false } : r))
      )
      loadStatusAndConnected()
    } catch (err) {
      setError(err.message)
    } finally {
      setDisconnectingRepoId(null)
    }
  }

  const filteredRepos = availableRepos.filter(r =>
    r.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (loading) return <p className="text-slate-400 text-center py-20">Loading GitHub integration...</p>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">GitHub Integration</h1>
          <p className="text-sm text-slate-400 mt-1">
            Connect your GitHub account to automatically trigger CI/CD pipelines on push events.
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-xl text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-xs hover:underline">Dismiss</button>
        </div>
      )}

      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
        {!status?.connected ? (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <span>🐙</span> Connect GitHub Account
              </h2>
              <p className="text-sm text-slate-400 mt-1">
                Authorize CI/CD Engine to view your repositories and automatically configure push webhooks.
              </p>
            </div>
            <button
              onClick={handleConnectGitHub}
              disabled={connecting}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-5 py-2.5 rounded-lg transition flex items-center gap-2 disabled:opacity-50"
            >
              {connecting ? 'Redirecting...' : 'Connect GitHub'}
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {status.github_avatar_url ? (
                <img
                  src={status.github_avatar_url}
                  alt={status.github_login}
                  className="w-12 h-12 rounded-full border border-slate-600"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center text-xl">🐙</div>
              )}
              <div>
                <div className="font-semibold text-white flex items-center gap-2">
                  <span>{status.github_name || status.github_login}</span>
                  <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded font-mono">
                    @{status.github_login}
                  </span>
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Connected on {new Date(status.created_at).toLocaleDateString()}
                </div>
              </div>
            </div>

            <button
              onClick={handleDisconnectGitHub}
              className="text-xs text-slate-400 hover:text-red-400 border border-slate-700 hover:border-red-500/40 px-3 py-1.5 rounded-lg transition"
            >
              Disconnect Account
            </button>
          </div>
        )}
      </div>

      {status?.connected && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Connected Repositories ({connectedRepos.length})</h2>
            <button
              onClick={fetchAvailableRepos}
              disabled={loadingRepos}
              className="bg-slate-700 hover:bg-slate-600 text-white text-xs px-4 py-2 rounded-lg transition flex items-center gap-1.5 disabled:opacity-50"
            >
              {loadingRepos ? 'Loading repos...' : '+ Add / Manage Repositories'}
            </button>
          </div>

          {connectedRepos.length === 0 ? (
            <div className="bg-slate-800 rounded-xl p-8 text-center text-slate-400 border border-slate-700">
              No repositories connected yet. Click <strong>+ Add / Manage Repositories</strong> to select repositories to automate.
            </div>
          ) : (
            <div className="space-y-3">
              {connectedRepos.map(repo => (
                <div
                  key={repo.id}
                  className="bg-slate-800 rounded-xl p-5 border border-slate-700 flex flex-wrap items-center justify-between gap-4"
                >
                  <div>
                    <div className="font-semibold flex items-center gap-2">
                      <span>{repo.full_name}</span>
                      {repo.private && (
                        <span className="text-[10px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded">Private</span>
                      )}
                      {repo.webhook_id && (
                        <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-mono">
                          Auto-Webhook Active
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      Branch: <code className="text-slate-300">{repo.default_branch}</code> · Connected {new Date(repo.connected_at).toLocaleDateString()}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {repo.last_status && (
                      <span className={`text-xs px-3 py-1 rounded-full border font-medium ${STATUS[repo.last_status]}`}>
                        {repo.last_status}
                      </span>
                    )}

                    {repo.pipeline_id && (
                      <Link
                        to={`/runs?pipelineId=${repo.pipeline_id}`}
                        className="text-xs bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded-lg transition"
                      >
                        Pipeline Runs
                      </Link>
                    )}

                    <button
                      onClick={() => handleDisconnectRepo(repo)}
                      disabled={disconnectingRepoId === repo.github_repo_id}
                      className="text-xs text-red-400 hover:text-red-300 px-2 py-1 transition"
                    >
                      {disconnectingRepoId === repo.github_repo_id ? 'Disconnecting...' : 'Disconnect'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showRepoSelector && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-lg">Select Repositories to Connect</h3>
            <button
              onClick={() => setShowRepoSelector(false)}
              className="text-slate-400 hover:text-white text-sm"
            >
              ✕ Close
            </button>
          </div>

          <input
            type="text"
            placeholder="Search GitHub repositories..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
          />

          <div className="max-h-96 overflow-y-auto space-y-2 pr-1">
            {filteredRepos.length === 0 ? (
              <p className="text-slate-500 text-sm text-center py-6">No repositories found.</p>
            ) : (
              filteredRepos.map(repo => (
                <div
                  key={repo.id}
                  className="bg-slate-900/60 rounded-lg p-3 border border-slate-700/60 flex items-center justify-between gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm truncate flex items-center gap-2">
                      <span>{repo.full_name}</span>
                      {repo.private && (
                        <span className="text-[10px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded">Private</span>
                      )}
                    </div>
                    {repo.description && (
                      <p className="text-xs text-slate-400 truncate mt-0.5">{repo.description}</p>
                    )}
                  </div>

                  {repo.connected ? (
                    <span className="text-xs text-emerald-400 font-medium px-3 py-1 bg-emerald-500/10 rounded border border-emerald-500/20">
                      ✓ Connected
                    </span>
                  ) : (
                    <button
                      onClick={() => handleConnectRepo(repo)}
                      disabled={connectingRepoId === repo.id}
                      className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                    >
                      {connectingRepoId === repo.id ? 'Connecting...' : 'Connect'}
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
