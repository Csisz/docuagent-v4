/**
 * ModuleContext â€” feature flag state for the current tenant.
 *
 * Fetches /core/features on login, exposes:
 *   isEnabled(moduleKey)  â†’ bool
 *   modules               â†’ { key: enabled } map
 *   plan                  â†’ "starter" | "pro" | "enterprise"
 */
import { createContext, useContext, useEffect, useState } from "react"
import { useAuth } from "@/core/auth/AuthContext"
import { api } from "@/core/api"

const ModuleContext = createContext({ modules: {}, isEnabled: () => false, plan: "starter" })

export function ModuleProvider({ children }) {
  const { user } = useAuth()
  const [modules, setModules] = useState({})
  const [plan, setPlan]       = useState("starter")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) { setModules({}); setLoading(false); return }

    api.get("/core/features")
      .then(({ data }) => {
        const map = {}
        data.modules.forEach(m => { map[m.key] = m.enabled })
        setModules(map)
        setPlan(data.plan ?? "starter")
      })
      .catch(() => setModules({}))
      .finally(() => setLoading(false))
  }, [user])

  return (
    <ModuleContext.Provider value={{
      modules,
      plan,
      loading,
      isEnabled: (key) => modules[key] ?? false,
    }}>
      {children}
    </ModuleContext.Provider>
  )
}

export const useModules = () => useContext(ModuleContext)
