/**
 * AuditTab — Audit log viewer
 * - tenant admin: own tenant logs
 * - superadmin: all tenants (with optional tenant filter)
 */
import { useState, useEffect, useCallback } from "react"
import { api } from "@/core/api"
import { Search, RefreshCw, ChevronDown, ChevronRight } from "lucide-react"

const ACTION_COLORS = {
  "invoice":  "bg-blue-50 text-blue-700",
  "email":    "bg-indigo-50 text-indigo-700",
  "admin":    "bg-purple-50 text-purple-700",
  "user":     "bg-amber-50 text-amber-700",
  "feature":  "bg-green-50 text-green-700",
  "approval": "bg-orange-50 text-orange-700",
}

function actionColor(action) {
  const prefix = action?.split(".")?.[0] ?? ""
  return ACTION_COLORS[prefix] ?? "bg-gray-100 text-gray-600"
}

export default function AuditTab({ tenantId, isSuperadmin }) {
  const [rows,    setRows]    = useState([])
  const [total,   setTotal]   = useState(0)
  const [loading, setLoading] = useState(false)
  const [action,  setAction]  = useState("")
  const [offset,  setOffset]  = useState(0)
  const [expanded, setExpanded] = useState(null)
  const LIMIT = 50

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: LIMIT, offset })
      if (tenantId && isSuperadmin) params.set("tenant_id", tenantId)
      if (action) params.set("action", action)
      const res = await api.get(`/admin/audit?${params}`)
      setRows(res.data.audit_log ?? [])
      setTotal(res.data.total ?? 0)
    } catch(e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [tenantId, isSuperadmin, action, offset])

  useEffect(() => { load() }, [load])

  function fmt(ts) {
    if (!ts) return "—"
    return new Date(ts).toLocaleString("hu-HU", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit"
    })
  }

  return (
    <div className="space-y-3">

      {/* Filters */}
      <div className="flex items-center gap-2">
        <div className="relative w-56">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={action}
            onChange={e => { setAction(e.target.value); setOffset(0) }}
            placeholder="Szűrés eseményre..."
            className="w-full pl-7 pr-3 h-8 text-[12px] rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        <button
          onClick={() => { setOffset(0); load() }}
          className="h-8 w-8 flex items-center justify-center rounded-lg border border-border hover:bg-muted transition-colors"
        >
          <RefreshCw size={12} className={loading ? "animate-spin text-muted-foreground" : "text-muted-foreground"} />
        </button>
        <span className="text-[11px] text-muted-foreground ml-1">{total} esemény összesen</span>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide w-[170px]">Időpont</th>
              <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Esemény</th>
              <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Felhasználó</th>
              {isSuperadmin && (
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Tenant</th>
              )}
              <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Erőforrás</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && (
              <tr><td colSpan={6} className="text-center py-8 text-muted-foreground text-[12px]">Betöltés...</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={6} className="text-center py-8 text-muted-foreground text-[12px]">Nincs audit esemény</td></tr>
            )}
            {rows.map(r => (
              <>
                <tr
                  key={r.id}
                  onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                  className="hover:bg-muted/20 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-2.5 text-muted-foreground font-mono text-[10px]">{fmt(r.created_at)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${actionColor(r.action)}`}>
                      {r.action}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{r.user_email ?? "system"}</td>
                  {isSuperadmin && (
                    <td className="px-4 py-2.5 text-muted-foreground">{r.tenant_name ?? "—"}</td>
                  )}
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {r.resource_type && (
                      <span className="font-mono text-[10px]">{r.resource_type}</span>
                    )}
                    {r.resource_id && (
                      <span className="text-[10px] text-muted-foreground/60 ml-1">
                        #{r.resource_id.slice(0, 8)}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2.5">
                    {expanded === r.id
                      ? <ChevronDown size={12} className="text-muted-foreground" />
                      : <ChevronRight size={12} className="text-muted-foreground" />
                    }
                  </td>
                </tr>
                {expanded === r.id && (
                  <tr key={`${r.id}-detail`} className="bg-muted/10">
                    <td colSpan={isSuperadmin ? 6 : 5} className="px-6 py-3">
                      <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap font-mono bg-muted/30 rounded-lg p-3 max-h-40 overflow-auto">
                        {JSON.stringify(r.details, null, 2)}
                      </pre>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > LIMIT && (
        <div className="flex items-center justify-between text-[12px]">
          <button
            onClick={() => setOffset(Math.max(0, offset - LIMIT))}
            disabled={offset === 0}
            className="px-3 h-8 rounded-lg border border-border hover:bg-muted disabled:opacity-40"
          >
            ← Előző
          </button>
          <span className="text-muted-foreground">
            {offset + 1}–{Math.min(offset + LIMIT, total)} / {total}
          </span>
          <button
            onClick={() => setOffset(offset + LIMIT)}
            disabled={offset + LIMIT >= total}
            className="px-3 h-8 rounded-lg border border-border hover:bg-muted disabled:opacity-40"
          >
            Következő →
          </button>
        </div>
      )}

    </div>
  )
}
