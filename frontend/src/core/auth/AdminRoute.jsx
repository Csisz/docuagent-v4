/**
 * AdminRoute — only role=admin OR is_superadmin can access.
 * Redirects to / with a toast if unauthorized.
 */
import { Navigate } from "react-router-dom"
import { useAuth } from "@/core/auth/AuthContext"

export default function AdminRoute({ children, superadminOnly = false }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  const isSuperadmin = user?.is_superadmin === true
  const isAdmin      = user?.role === "admin" || isSuperadmin

  if (superadminOnly && !isSuperadmin) return <Navigate to="/" replace />
  if (!superadminOnly && !isAdmin)     return <Navigate to="/" replace />

  return children
}
