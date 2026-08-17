import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

export default function GitHubCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState(null)

  useEffect(() => {
    const success = searchParams.get('success')
    const err = searchParams.get('error')

    if (success === 'true') {
      const timer = setTimeout(() => {
        navigate('/?tab=github')
      }, 1500)
      return () => clearTimeout(timer)
    }

    if (err) {
      setError(err)
    }
  }, [searchParams, navigate])

  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 text-slate-100">
        <div className="bg-slate-800 border border-red-500/40 rounded-xl p-8 max-w-md w-full text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-red-400 mb-2">GitHub Authorization Failed</h2>
          <p className="text-sm text-slate-300 mb-6 font-mono bg-slate-900/60 p-3 rounded border border-slate-700">
            Error: {error}
          </p>
          <button
            onClick={() => navigate('/?tab=github')}
            className="bg-slate-700 hover:bg-slate-600 text-white px-5 py-2.5 rounded-lg text-sm transition"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 text-slate-100">
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 max-w-md w-full text-center">
        <div className="text-4xl mb-4 animate-bounce">⚡</div>
        <h2 className="text-xl font-bold text-emerald-400 mb-2">Connecting GitHub...</h2>
        <p className="text-sm text-slate-400">
          Authorization successful! Redirecting you back to your dashboard...
        </p>
      </div>
    </div>
  )
}
