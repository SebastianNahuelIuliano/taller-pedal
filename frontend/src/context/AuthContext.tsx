import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import {
  clearToken,
  getToken,
  getProfile,
  login as apiLogin,
  register as apiRegister,
} from '../services/api'
import { AuthContext, type RegisterData } from './auth-context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<import('../services/api').User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    async function restoreSession() {
      if (!getToken()) {
        if (active) setLoading(false)
        return
      }

      try {
        const profile = await getProfile()
        if (active) setUser(profile)
      } catch {
        clearToken()
        if (active) setUser(null)
      } finally {
        if (active) setLoading(false)
      }
    }

    void restoreSession()

    return () => {
      active = false
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const authenticatedUser = await apiLogin(email, password)
    setUser(authenticatedUser)
  }, [])

  const register = useCallback(async (data: RegisterData) => {
    const authenticatedUser = await apiRegister(data)
    setUser(authenticatedUser)
  }, [])

  const logout = useCallback(() => {
    clearToken()
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
