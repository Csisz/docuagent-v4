/**
 * ModuleRoute — route-level module guard.
 * If the module is disabled, shows an upgrade prompt instead of the page.
 *
 * Usage:
 *   <Route path="/invoice/*" element={
 *     <ModuleRoute module="invoice_agent">
 *       <InvoicePage />
 *     </ModuleRoute>
 *   } />
 */
import { useModules } from "./ModuleContext"
import UpgradePage from "@/pages/UpgradePage"

export default function ModuleRoute({ module, children }) {
  const { isEnabled, loading } = useModules()

  if (loading) return null
  if (!isEnabled(module)) return <UpgradePage module={module} />

  return children
}
