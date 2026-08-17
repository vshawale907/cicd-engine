import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { apiFetch, setToken } from '../utils/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setTokenState] = useState(() => localStorage.getItem('cicd_token'))
  const [loading, setLoading] = useState(true)

  const restoreUser = useCallback(async (authToken) => {
    try {
      setToken(authToken)
      const res = await apiFetch('/api/auth/me')
      if (res.ok) {
        const userData = await res.json()
        setUser(userData)
      } else {
        localStorage.removeItem('cicd_token')
        setToken(null)
        setTokenState(null)
      }
    } catch {
      localStorage.removeItem('cicd_token')
      setToken(null)
      setTokenState(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const savedToken = localStorage.getItem('cicd_token')
    if (savedToken) {
      restoreUser(savedToken)
    } else {
      setLoading(false)
    }
  }, [restoreUser])

  const login = useCallback(async (email, password) => {
    const res = await apiFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })

    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || 'Login failed')
    }

    const data = await res.json()
    localStorage.setItem('cicd_token', data.token)
    setTokenState(data.token)
    setToken(data.token)
    setUser(data.user)
    return data
  }, [])

  const register = useCallback(async (email, password) => {
    const res = await apiFetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, role: 'admin' }),
    })

    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || 'Registration failed')
    }

    const data = await res.json()
    localStorage.setItem('cicd_token', data.token)
    setTokenState(data.token)
    setToken(data.token)
    setUser(data.user)
    return data
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('cicd_token')
    setTokenState(null)
    setToken(null)
    setUser(null)
  }, [])

  if (loading) {
    return <div className="min-h-screen bg-slate-900 text-slate-400 flex items-center justify-center">Loading session...</div>
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout, register }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
