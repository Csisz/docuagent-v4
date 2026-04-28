/**
 * V4 AuthContext
 * - Login: POST /core/auth/login
 * - Me:    GET  /core/auth/me
 * - Token: localStorage "access_token"
 * - Login response includes enabled_modules -> stored in context
 */
import { createContext, useContext, useState, useEffect, useCallback } from "react"
import { api } from "@/core/api"

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,           setUser]           = useState(null)
  const [tenant,         setTenant]         = useState(null)
  const [enabledModules, setEnabledModules] = useState({})
  const [loading,        setLoading]        = useState(true)

  // On mount: restore session from localStorage
  useEffect(() => {
    const token = localStorage.getItem("access_token")
    if (token) {
      fetchMe()
    } else {
      setLoading(false)
    }
  }, [])

  async function fetchMe() {
    try {
      const res = await api.get("/core/auth/me")
      setUser(res.data.user)
      setTenant(res.data.tenant)
      // Fetch modules separately (me endpoint does not return them)
      const f = await api.get("/core/features")
      const map = {}
      f.data.data.modules.forEach(m => { map[m.key] = m.enabled })
      setEnabledModules(map)
    } catch {
      logout()
    } finally {
      setLoading(false)
    }
  }

  const login = useCallback(async (email, password) => {
    const res = await api.post("/core/auth/login", { email, password })
    const data = res.data
    localStorage.setItem("access_token", data.access_token)
    setUser(data.user)
    setTenant(data.tenant)
    // Login response already includes enabled_modules
    setEnabledModules(data.enabled_modules ?? {})
    return data
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem("access_token")
    setUser(null)
    setTenant(null)
    setEnabledModules({})
  }, [])

  const isModuleEnabled = useCallback((key) => {
    return enabledModules[key] ?? false
  }, [enabledModules])

  return (
    <AuthContext.Provider value={{
      user,
      tenant,
      enabledModules,
      loading,
      login,
      logout,
      isModuleEnabled,
      isAdmin:      user?.role === "admin" || user?.is_superadmin === true,
      isAgent:      user?.role === "agent" || user?.role === "admin",
      isDemo:       tenant?.slug === "demo",
      isSuperadmin: user?.is_superadmin === true,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be inside AuthProvider")
  return ctx
}