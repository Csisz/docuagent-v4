/**
 * TenantsTab — Superadmin: list all tenants, edit plan, toggle modules
 */
import { useState, useEffect, useCallback } from "react"
import { api } from "@/core/api"
import {
  Search, RefreshCw, ChevronRight, Check, X,
  Building2, Users, Zap, Edit2, CheckCircle2
} from "lucide-react"

const PLAN_COLORS = {
  free:       "bg-gray-100 text-gray-600",
  starter:    "bg-blue-50 text-blue-700",
  pro:        "bg-indigo-50 text-indigo-700",
  enterprise: "bg-purple-50 text-purple-700",
}

const ALL_MODULES = [
  { key: "email_agent",     label: "Email Agent"    },
  { key: "invoice_agent",   label: "Invoice Agent"  },
  { key: "document_agent",  label: "Document Agent" },
  { key: "crm_module",      label: "CRM"            },
  { key: "calendar_module", label: "Naptár"         },
  { key: "agent_builder",   label: "Agent Builder"  },
]

const PLANS = ["free", "starter", "pro", "enterprise"]

export default function TenantsTab({ selectedTenantId, onSelectTenant }) {
  const [tenants,  setTenants]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState("")
  const [planFilter, setPlanFilter] = useState("")
  const [detail,   setDetail]   = useState(null)   // { tenant, modules, user_count }
  const [saving,   setSaving]   = useState(false)
  const [editPlan, setEditPlan] = useState(false)
  const [newPlan,  setNewPlan]  = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set("search", search)
      if (planFilter) params.set("plan", planFilter)
      const res = await api.get(`/admin/tenants?${params}`)
      setTenants(res.data.tenants ?? [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [search, planFilter])

  useEffect(() => { load() }, [load])

  async function openDetail(tenantId) {
    const res = await api.get(`/admin/tenants/${tenantId}`)
    setDetail(res.data)
    setNewPlan(res.data.tenant.plan)
    setEditPlan(false)
    onSelectTenant?.(tenantId)
  }

  async function savePlan() {
    if (!detail) return
    setSaving(true)
    try {
      await api.patch(`/admin/tenants/${detail.tenant.id}`, { plan: newPlan })
      setDetail(d => ({ ...d, tenant: { ...d.tenant, plan: newPlan } }))
      setEditPlan(false)
      load()
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive() {
    if (!detail) return
    const next = !detail.tenant.is_active
    await api.patch(`/admin/tenants/${detail.tenant.id}`, { is_active: next })
    setDetail(d => ({ ...d, tenant: { ...d.tenant, is_active: next } }))
    load()
  }

  async function toggleModule(moduleKey, currentEnabled) {
    if (!detail) return
    const next = !currentEnabled
    await api.post(`/admin/tenants/${detail.tenant.id}/modules`, {
      modules: { [moduleKey]: next }
    })
    setDetail(d => ({
      ...d,
      modules: {
        ...d.modules,
        [moduleKey]: { ...(d.modules[moduleKey] ?? {}), enabled: next }
      }
    }))
  }

  return (
    <div className="flex gap-4 min-h-[500px]">

      {/* Left: tenant list */}
      <div className="w-[340px] flex-shrink-0 space-y-2">

        {/* Filters */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Keresés..."
              className="w-full pl-7 pr-3 h-8 text-[12px] rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <select
            value={planFilter}
            onChange={e => setPlanFilter(e.target.value)}
            className="h-8 px-2 text-[12px] rounded-lg border border-border bg-background focus:outline-none"
          >
            <option value="">Minden plan</option>
            {PLANS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <button onClick={load} className="h-8 w-8 flex items-center justify-center rounded-lg border border-border hover:bg-muted transition-colors">
            <RefreshCw size={12} className={loading ? "animate-spin text-muted-foreground" : "text-muted-foreground"} />
          </button>
        </div>

        {/* List */}
        <div className="space-y-1">
          {loading && (
            <div className="text-center py-8 text-[12px] text-muted-foreground">Betöltés...</div>
          )}
          {!loading && tenants.length === 0 && (
            <div className="text-center py-8 text-[12px] text-muted-foreground">Nincs találat</div>
          )}
          {tenants.map(t => (
            <button
              key={t.id}
              onClick={() => openDetail(t.id)}
              className={[
                "w-full text-left px-3 py-2.5 rounded-lg border transition-all duration-100",
                detail?.tenant.id === t.id
                  ? "border-blue-500/40 bg-blue-50"
                  : "border-border bg-card hover:bg-muted/50",
              ].join(" ")}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-6 h-6 rounded-md bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0">
                    {(t.name ?? "?")[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[12px] font-medium text-foreground truncate">{t.name}</div>
                    <div className="text-[10px] text-muted-foreground">{t.slug}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${PLAN_COLORS[t.plan] ?? "bg-gray-100 text-gray-600"}`}>
                    {t.plan}
                  </span>
                  {!t.is_active && (
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-red-50 text-red-600">
                      INAKTÍV
                    </span>
                  )}
                  <ChevronRight size={12} className="text-muted-foreground" />
                </div>
              </div>
              <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><Users size={9} />{t.user_count ?? 0} user</span>
                <span className="flex items-center gap-1"><Zap size={9} />{t.enabled_modules ?? 0} modul</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right: detail panel */}
      {detail ? (
        <div className="flex-1 bg-card border border-border rounded-xl p-5 space-y-5">

          {/* Tenant header */}
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-[16px] font-semibold text-foreground">{detail.tenant.name}</h2>
                <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${PLAN_COLORS[detail.tenant.plan] ?? ""}`}>
                  {detail.tenant.plan}
                </span>
                {!detail.tenant.is_active && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 font-semibold">INAKTÍV</span>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                slug: <code className="bg-muted px-1 rounded">{detail.tenant.slug}</code>
                &nbsp;·&nbsp;{detail.user_count} felhasználó
              </div>
            </div>
            <button
              onClick={toggleActive}
              className={[
                "text-[11px] font-medium px-3 py-1.5 rounded-lg border transition-colors",
                detail.tenant.is_active
                  ? "border-red-200 text-red-600 hover:bg-red-50"
                  : "border-green-200 text-green-600 hover:bg-green-50",
              ].join(" ")}
            >
              {detail.tenant.is_active ? "Deaktiválás" : "Aktiválás"}
            </button>
          </div>

          {/* Plan editor */}
          <div className="border border-border rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium text-foreground">Plan</span>
              {!editPlan && (
                <button
                  onClick={() => setEditPlan(true)}
                  className="flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-700"
                >
                  <Edit2 size={10} /> Módosítás
                </button>
              )}
            </div>
            {editPlan ? (
              <div className="flex items-center gap-2">
                <select
                  value={newPlan}
                  onChange={e => setNewPlan(e.target.value)}
                  className="h-8 px-2 text-[12px] rounded-lg border border-border bg-background focus:outline-none"
                >
                  {PLANS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <button
                  onClick={savePlan}
                  disabled={saving}
                  className="h-8 px-3 text-[12px] font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? "Mentés..." : "Mentés"}
                </button>
                <button
                  onClick={() => { setEditPlan(false); setNewPlan(detail.tenant.plan) }}
                  className="h-8 px-3 text-[12px] rounded-lg border border-border hover:bg-muted"
                >
                  Mégse
                </button>
              </div>
            ) : (
              <span className={`inline-block text-[11px] font-semibold px-2 py-1 rounded-full ${PLAN_COLORS[detail.tenant.plan] ?? ""}`}>
                {detail.tenant.plan}
              </span>
            )}
          </div>

          {/* Module toggles */}
          <div className="border border-border rounded-lg p-4 space-y-2">
            <div className="text-[12px] font-medium text-foreground mb-3">Modulok</div>
            <div className="grid grid-cols-2 gap-2">
              {ALL_MODULES.map(({ key, label }) => {
                const enabled = detail.modules[key]?.enabled ?? false
                return (
                  <button
                    key={key}
                    onClick={() => toggleModule(key, enabled)}
                    className={[
                      "flex items-center justify-between px-3 py-2 rounded-lg border text-[12px] font-medium transition-all duration-150",
                      enabled
                        ? "border-green-200 bg-green-50 text-green-700"
                        : "border-border bg-background text-muted-foreground hover:bg-muted/50",
                    ].join(" ")}
                  >
                    <span>{label}</span>
                    {enabled
                      ? <CheckCircle2 size={13} className="text-green-500" />
                      : <X size={13} className="text-muted-foreground/50" />
                    }
                  </button>
                )
              })}
            </div>
          </div>

        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-card border border-border rounded-xl">
          <div className="text-center space-y-2">
            <Building2 size={28} className="text-muted-foreground/30 mx-auto" />
            <p className="text-[12px] text-muted-foreground">Válassz egy tenantet a bal oldali listából</p>
          </div>
        </div>
      )}

    </div>
  )
}
