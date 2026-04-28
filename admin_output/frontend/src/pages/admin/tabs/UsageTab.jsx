/**
 * UsageTab — Usage / metering dashboard
 * Superadmin: platform-wide stats + per-tenant drill-down
 * Tenant admin: own tenant only
 */
import { useState, useEffect, useCallback } from "react"
import { api } from "@/core/api"
import { BarChart3, TrendingUp, Mail, FileText, Brain, Database } from "lucide-react"

const MODULE_LABELS = {
  core:           "Core",
  email_agent:    "Email Agent",
  invoice_agent:  "Invoice Agent",
  document_agent: "Document Agent",
  crm_module:     "CRM",
}

function MetricCard({ icon: Icon, label, value, sub, color = "blue" }) {
  const colors = {
    blue:   "bg-blue-50 text-blue-600",
    green:  "bg-green-50 text-green-600",
    purple: "bg-purple-50 text-purple-600",
    amber:  "bg-amber-50 text-amber-600",
  }
  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-2">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colors[color]}`}>
        <Icon size={15} />
      </div>
      <div>
        <div className="text-[20px] font-semibold text-foreground tracking-tight">{value}</div>
        <div className="text-[11px] font-medium text-foreground">{label}</div>
        {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}

export default function UsageTab({ tenantId, isSuperadmin }) {
  const [usage,   setUsage]   = useState([])
  const [stats,   setStats]   = useState(null)   // superadmin platform stats
  const [loading, setLoading] = useState(false)
  const [months,  setMonths]  = useState(3)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ months })
      if (tenantId) params.set("tenant_id", tenantId)
      const res = await api.get(`/admin/usage?${params}`)
      setUsage(res.data.usage ?? [])

      if (isSuperadmin) {
        const s = await api.get("/admin/stats")
        setStats(s.data)
      }
    } catch(e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [tenantId, isSuperadmin, months])

  useEffect(() => { load() }, [load])

  // Aggregate current month across modules
  const currentMonth = (() => {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, "0")
    const prefix = `${y}-${m}`
    return usage.filter(r => (r.period_start ?? "").startsWith(prefix))
  })()

  const totals = currentMonth.reduce((acc, r) => {
    acc.emails     += r.emails_processed   ?? 0
    acc.ai_calls   += r.ai_calls_made      ?? 0
    acc.tokens     += r.tokens_consumed    ?? 0
    acc.cost_usd   += r.cost_usd           ?? 0
    acc.documents  += r.documents_stored   ?? 0
    return acc
  }, { emails: 0, ai_calls: 0, tokens: 0, cost_usd: 0, documents: 0 })

  function fmtNum(n) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
    return String(n)
  }

  // Group usage by period for timeline
  const byPeriod = {}
  for (const r of usage) {
    const p = r.period_start?.slice(0, 7) ?? "?"
    if (!byPeriod[p]) byPeriod[p] = []
    byPeriod[p].push(r)
  }
  const periods = Object.keys(byPeriod).sort().reverse()

  return (
    <div className="space-y-5">

      {/* Superadmin platform stats */}
      {isSuperadmin && stats && (
        <div>
          <h3 className="text-[12px] font-semibold text-foreground mb-3">Platform összesítő</h3>
          <div className="grid grid-cols-4 gap-3">
            <MetricCard icon={Database}   label="Aktív tenant"    value={stats.total_tenants} color="blue" />
            <MetricCard icon={Brain}      label="Felhasználó"     value={stats.total_users}   color="purple" />
            <MetricCard icon={TrendingUp} label="Költ. (USD/hó)"  value={`$${stats.cost_this_month_usd?.toFixed(2)}`} color="amber" />
            <div className="bg-card border border-border rounded-xl p-4 space-y-1.5">
              <div className="text-[11px] font-semibold text-foreground mb-1">Planok</div>
              {stats.by_plan?.map(p => (
                <div key={p.plan} className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground capitalize">{p.plan}</span>
                  <span className="font-medium text-foreground">{p.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Current month metrics */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[12px] font-semibold text-foreground">
            {tenantId ? "Tenant" : "Platform"} — aktuális hónap
          </h3>
          <select
            value={months}
            onChange={e => setMonths(Number(e.target.value))}
            className="h-7 px-2 text-[11px] rounded-lg border border-border bg-background"
          >
            <option value={1}>1 hónap</option>
            <option value={3}>3 hónap</option>
            <option value={6}>6 hónap</option>
            <option value={12}>12 hónap</option>
          </select>
        </div>

        {loading ? (
          <div className="text-center py-8 text-[12px] text-muted-foreground">Betöltés...</div>
        ) : (
          <div className="grid grid-cols-5 gap-3">
            <MetricCard icon={Mail}     label="Email feldolg."  value={fmtNum(totals.emails)}    color="blue" />
            <MetricCard icon={Brain}    label="AI hívás"        value={fmtNum(totals.ai_calls)}  color="purple" />
            <MetricCard icon={BarChart3} label="Token"          value={fmtNum(totals.tokens)}    color="green" />
            <MetricCard icon={FileText} label="Dokumentum"      value={fmtNum(totals.documents)} color="amber" />
            <MetricCard icon={TrendingUp} label="AI költ. (USD)" value={`$${totals.cost_usd.toFixed(3)}`} color="green"
              sub="Becsült, fire-and-forget alapján"
            />
          </div>
        )}
      </div>

      {/* Usage timeline by period */}
      {!loading && periods.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Időszak</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Modul</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Email</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">AI hívás</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Token</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Dok.</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Költ. (USD)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {periods.flatMap(period =>
                byPeriod[period].map((r, i) => (
                  <tr key={`${period}-${r.module}-${i}`} className="hover:bg-muted/20">
                    <td className="px-4 py-2.5 font-mono text-[11px] text-muted-foreground">
                      {i === 0 ? period : ""}
                    </td>
                    <td className="px-4 py-2.5 text-foreground">
                      {MODULE_LABELS[r.module] ?? r.module}
                    </td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{fmtNum(r.emails_processed ?? 0)}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{fmtNum(r.ai_calls_made ?? 0)}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{fmtNum(r.tokens_consumed ?? 0)}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{fmtNum(r.documents_stored ?? 0)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-[11px] text-muted-foreground">
                      ${(r.cost_usd ?? 0).toFixed(4)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loading && periods.length === 0 && (
        <div className="text-center py-8 text-[12px] text-muted-foreground bg-card border border-border rounded-xl">
          Nincs használati adat a kiválasztott időszakra.
        </div>
      )}

    </div>
  )
}
