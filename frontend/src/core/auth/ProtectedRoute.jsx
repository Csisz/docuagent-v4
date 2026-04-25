/**
 * Redirects to /login if user is not authenticated.
 * Wraps any route that requires auth.
 */
import { Navigate } from "react-router-dom"
import { useAuth } from "./AuthContext"

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  return children
}
