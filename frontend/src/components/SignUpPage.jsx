import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

function PasswordStrength({ password }) {
  const checks = [
    { label: 'At least 8 characters', pass: password.length >= 8 },
    { label: 'Contains a number', pass: /\d/.test(password) },
    { label: 'Contains a letter', pass: /[a-zA-Z]/.test(password) },
  ]
  const score = checks.filter(c => c.pass).length

  const bar = [
    { color: 'bg-red-500', label: 'Weak' },
    { color: 'bg-yellow-500', label: 'Fair' },
    { color: 'bg-emerald-500', label: 'Strong' },
  ]

  if (!password) return null

  return (
    <div className="mt-2 space-y-2">
      {/* Strength bar */}
      <div className="flex gap-1 h-1">
        {bar.map((b, i) => (
          <div
            key={i}
            className={`flex-1 rounded-full transition-all duration-300 ${
              i < score ? b.color : 'bg-slate-700'
            }`}
          />
        ))}
      </div>
      <p className={`text-xs font-medium ${bar[score - 1]?.color.replace('bg-', 'text-') || 'text-slate-500'}`}>
        {score > 0 ? bar[score - 1].label : ''}
      </p>
      {/* Checklist */}
      <ul className="space-y-1">
        {checks.map((c, i) => (
          <li key={i} className={`flex items-center gap-1.5 text-xs transition-colors ${c.pass ? 'text-emerald-400' : 'text-slate-500'}`}>
            <span>{c.pass ? '✓' : '○'}</span>
            {c.label}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function SignUpPage({ onGoToLogin }) {
  const { register } = useAuth()
  const [email, setEmail]           = useState('')
  const [password, setPassword]     = useState('')
  const [confirm, setConfirm]       = useState('')
  const [error, setError]           = useState(null)
  const [loading, setLoading]       = useState(false)
  const [success, setSuccess]       = useState(false)
  const [showPass, setShowPass]     = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (password !== confirm) {
      setError("Passwords don't match")
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setLoading(true)
    try {
      await register(email, password)
      setSuccess(true)
      // AuthContext sets user → App.jsx automatically shows dashboard
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const inputClass = `w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-slate-100
    placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition`

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
      {/* Ambient glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative">
        {/* Logo / Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-4xl mb-4">
            ⚡
          </div>
          <h1 className="text-3xl font-bold text-white">Create account</h1>
          <p className="text-slate-400 mt-2 text-sm">Join the CI/CD Engine workspace</p>
        </div>

        {/* Card */}
        <div className="bg-slate-800/80 backdrop-blur-sm rounded-2xl border border-slate-700 p-8 shadow-2xl">
          {success ? (
            <div className="text-center py-4">
              <div className="text-5xl mb-4">🎉</div>
              <h2 className="text-xl font-bold text-white mb-2">Account created!</h2>
              <p className="text-slate-400 text-sm">You're now signed in as a <span className="text-emerald-400 font-medium">viewer</span>. Redirecting to your dashboard…</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">

              {/* Email */}
              <div>
                <label htmlFor="signup-email" className="block text-sm font-medium text-slate-300 mb-1.5">
                  Email address
                </label>
                <input
                  id="signup-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={inputClass}
                />
              </div>

              {/* Password */}
              <div>
                <label htmlFor="signup-password" className="block text-sm font-medium text-slate-300 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="signup-password"
                    type={showPass ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className={inputClass + ' pr-10'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 text-xs transition"
                  >
                    {showPass ? 'Hide' : 'Show'}
                  </button>
                </div>
                <PasswordStrength password={password} />
              </div>

              {/* Confirm Password */}
              <div>
                <label htmlFor="signup-confirm" className="block text-sm font-medium text-slate-300 mb-1.5">
                  Confirm password
                </label>
                <input
                  id="signup-confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  className={`${inputClass} ${confirm && confirm !== password ? 'border-red-500/60 focus:ring-red-500' : confirm && confirm === password ? 'border-emerald-500/60 focus:ring-emerald-500' : ''}`}
                />
                {confirm && confirm !== password && (
                  <p className="text-xs text-red-400 mt-1">Passwords don't match</p>
                )}
                {confirm && confirm === password && (
                  <p className="text-xs text-emerald-400 mt-1">✓ Passwords match</p>
                )}
              </div>

              {/* Role info banner */}
              <div className="flex items-start gap-2.5 bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2.5">
                <span className="text-blue-400 text-sm mt-0.5">ℹ️</span>
                <p className="text-xs text-slate-400">
                  New accounts are granted <span className="text-blue-300 font-medium">viewer</span> access.
                  Contact an admin to be upgraded to admin.
                </p>
              </div>

              {/* Error */}
              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-400 flex items-center gap-2">
                  <span>⚠️</span> {error}
                </div>
              )}

              {/* Submit */}
              <button
                id="signup-submit"
                type="submit"
                disabled={loading || (confirm && confirm !== password)}
                className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed
                           text-white font-semibold py-2.5 rounded-lg transition text-sm flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    Creating account…
                  </>
                ) : 'Create account'}
              </button>
            </form>
          )}
        </div>

        {/* Switch to Login */}
        <p className="text-center text-sm text-slate-500 mt-6">
          Already have an account?{' '}
          <button
            onClick={onGoToLogin}
            className="text-emerald-400 hover:text-emerald-300 font-medium transition"
          >
            Sign in
          </button>
        </p>
      </div>
    </div>
  )
}
