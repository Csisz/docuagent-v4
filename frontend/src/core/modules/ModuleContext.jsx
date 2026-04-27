/**
 * V4 ModuleContext
 * Reads enabled_modules from AuthContext (set at login).
 * isEnabled(key) -> bool
 *
 * Note: modules are fetched at login and on session restore.
 * No separate API call needed here.
 */
import { createContext, useContext } from "react"
import { useAuth } from "@/core/auth/AuthContext"

const ModuleContext = createContext({ isEnabled: () => false })

export function ModuleProvider({ children }) {
  const { enabledModules, tenant } = useAuth()

  const isEnabled = (key) => enabledModules[key] ?? false

  return (
    <ModuleContext.Provider value={{ modules: enabledModules, isEnabled, plan: tenant?.plan ?? "starter" }}>
      {children}
    </ModuleContext.Provider>
  )
}

export const useModules = () => useContext(ModuleContext)