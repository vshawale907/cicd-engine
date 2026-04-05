import { createContext, useContext, useState, useCallback } from 'react'
import { setToken } from '../utils/api'

const AuthContext = createContext(null)

/**
 * AuthProvider wraps the app and exposes { user, token, login, logout }.
 * The JWT is stored ONLY in React state (never localStorage / sessionStorage).
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setTokenState] = useState(null)

  const login = useCallback(async (email, password) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })

    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || 'Login failed')
    }

    const data = await res.json()
    setTokenState(data.token)
    setToken(data.token)   // sync to the apiFetch module
    setUser(data.user)
    return data
  }, [])

  const logout = useCallback(() => {
    setTokenState(null)
    setToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

/** Hook to consume the auth context from any component. */
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
