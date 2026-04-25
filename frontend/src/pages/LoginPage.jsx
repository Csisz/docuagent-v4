/**
 * Login page â€” clean centered card.
 * V3-hoz kĂ©pest: nincs API key modal, nincs beĂˇgyazott logo
 * TODO: connect to AuthContext.login()
 */
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/core/auth/AuthContext"
import { Button } from "@/components/ui/Button"

export default function LoginPage() {
  const { login }   = useAuth()
  const navigate    = useNavigate()
  const [email, setEmail]       = useState("")
  const [password, setPassword] = useState("")
  const [error, setError]       = useState("")
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      await login(email, password)
      navigate("/")
    } catch (err) {
      setError(err.response?.data?.detail || "HibĂˇs email vagy jelszĂł")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0f1929] flex items-center justify-center p-4">
      <div className="w-full max-w-[380px]">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-[15px]">D</div>
          <div>
            <div className="text-white font-semibold text-[16px]">DocuAgent</div>
            <div className="text-white/40 text-[11px]">AI Business Automation</div>
          </div>
        </div>

        {/* Card */}
        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6">
          <h1 className="text-white text-[18px] font-semibold mb-1">BejelentkezĂ©s</h1>
          <p className="text-white/40 text-[13px] mb-6">Adja meg a hozzĂˇfĂ©rĂ©si adatait</p>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-[12px] text-white/50 mb-1.5">Email cĂ­m</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="nev@ceg.hu"
                required
                className="w-full h-10 px-3 rounded-lg bg-white/[0.06] border border-white/10 text-white text-[13px] placeholder:text-white/20 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-[12px] text-white/50 mb-1.5">JelszĂł</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="â€˘â€˘â€˘â€˘â€˘â€˘â€˘â€˘"
                required
                className="w-full h-10 px-3 rounded-lg bg-white/[0.06] border border-white/10 text-white text-[13px] placeholder:text-white/20 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            {error && <p className="text-red-400 text-[12px]">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-10 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2 mt-1"
            >
              {loading && <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
              BejelentkezĂ©s
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
