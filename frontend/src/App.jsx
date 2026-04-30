/**
 * V4 App — Module-aware routing
 *
 * Routes are protected at two levels:
 *   1. Auth: ProtectedRoute wrapper
 *   2. Module: ModuleRoute wrapper (checks feature flags)
 *
 * TODO: add all module routes as modules are built
 */
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { AuthProvider }   from "@/core/auth/AuthContext"
import { ModuleProvider } from "@/core/modules/ModuleContext"
import ProtectedRoute     from "@/core/auth/ProtectedRoute"
import AdminRoute         from "@/core/auth/AdminRoute"
import ModuleRoute        from "@/core/modules/ModuleRoute"
import AppLayout          from "@/shell/layout/AppLayout"
import LoginPage          from "@/pages/LoginPage"
import DashboardPage      from "@/pages/DashboardPage"
import ApprovalsPage      from "@/pages/ApprovalsPage"

import InvoicePage      from "@/modules/invoice/InvoicePage"
import EmailPage        from "@/modules/email/EmailPage"
import EmailDetailPage  from "@/modules/email/EmailDetailPage"
import SettingsPage     from "@/pages/SettingsPage"
import AdminPage        from "@/pages/admin/AdminPage"
// import DocumentPage from "@/modules/document/DocumentPage"

export default function App() {
  return (
    <AuthProvider>
      <ModuleProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route index element={<DashboardPage />} />
              <Route path="/approvals" element={<ApprovalsPage />} />

              {/* Module routes — wrapped in ModuleRoute */}
              <Route path="/invoice/*" element={<ModuleRoute module="invoice_agent"><InvoicePage /></ModuleRoute>} />
              <Route path="/email"     element={<ModuleRoute module="email_agent"><EmailPage /></ModuleRoute>} />
              <Route path="/email/:id" element={<ModuleRoute module="email_agent"><EmailDetailPage /></ModuleRoute>} />
              <Route path="/settings"  element={<SettingsPage />} />
              <Route path="/admin"     element={<AdminRoute><AdminPage /></AdminRoute>} />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ModuleProvider>
    </AuthProvider>
  )
}
