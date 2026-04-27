import { FileText, Clock, CheckCircle, Download, TrendingUp, Sparkles, AlertTriangle } from "lucide-react"
import { useGet } from "@/core/hooks/useApi"

const STAT_DEFS = [
  { key: "total",          label: "Összes számla",     icon: FileText,     accent: "blue" },
  { key: "pending_review", label: "Felülvizsgálat",    icon: Clock,        accent: "amber" },
  { key: "verified",       label: "Ellenőrizve",       icon: CheckCircle,  accent: "blue" },
  { key: "exported",       label: "Exportálva",        icon: Download,     accent: "emerald" },
  { key: "this_month",     label: "Ebben a hónapban",  icon: TrendingUp,   accent: "violet" },
]

const ACCENT = {
  blue:    { bg: "bg-blue-50",    border: "border-blue-100",    icon: "text-blue-600" },
  amber:   { bg: "bg-amber-50",   border: "border-amber-100",   icon: "text-amber-600" },
  emerald: { bg: "bg-emerald-50", border: "border-emerald-100", icon: "text-emerald-600" },
  violet:  { bg: "bg-violet-50",  border: "border-violet-100",  icon: "text-violet-600" },
}

const STATUS_BAR = [
  { key: "pending_review", label: "Felülvizsgálat", color: "bg-amber-400" },
  { key: "verified",       label: "Ellenőrizve",    color: "bg-blue-500" },
  { key: "exported",       label: "Exportálva",     color: "bg-emerald-500" },
]

export default function InvoiceStats() {
  const { data: resp, isLoading, error } = useGet("invoice-stats", "/invoice/stats")
  const stats = resp?.data

  if (isLoading) {
    return <div className="py-12 text-center text-[13px] text-muted-foreground">Betöltés...</div>
  }

  if (error || !stats) {
    return <div className="py-12 text-center text-[13px] text-red-500">Nem sikerült betölteni a statisztikákat</div>
  }

  const total = stats.total || 1  // avoid div-by-zero

  return (
    <div className="space-y-6">

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {STAT_DEFS.map(def => {
          const c = ACCENT[def.accent]
          const Icon = def.icon
          return (
            <div key={def.key} className="bg-card border border-border rounded-xl p-4 space-y-3">
              <div className={`w-8 h-8 rounded-lg ${c.bg} border ${c.border} flex items-center justify-center`}>
                <Icon size={14} className={c.icon} />
              </div>
              <div>
                <div className="text-[22px] font-semibold text-foreground tabular-nums leading-none">
                  {stats[def.key] ?? 0}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">{def.label}</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Confidence */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles size={14} className="text-violet-500" />
          <h3 className="text-[13px] font-semibold text-foreground">AI átlagos bizonyosság</h3>
        </div>
        <div className="flex items-end gap-4">
          <div className="text-[36px] font-semibold text-foreground tabular-nums leading-none">
            {Math.round((stats.avg_confidence ?? 0) * 100)}%
          </div>
          <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden mb-1.5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500 transition-all duration-500"
              style={{ width: `${Math.round((stats.avg_confidence ?? 0) * 100)}%` }}
            />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          {(stats.avg_confidence ?? 0) >= 0.85
            ? "Kiváló — a legtöbb számlát automatikusan fel lehet dolgozni"
            : (stats.avg_confidence ?? 0) >= 0.65
            ? "Közepes — néhány számla manuális ellenőrzést igényel"
            : "Alacsony — a legtöbb számla felülvizsgálatot igényel"
          }
        </p>
      </div>

      {/* Due date alerts */}
      {((stats.overdue ?? 0) > 0 || (stats.due_soon ?? 0) > 0) && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-[13px] font-semibold text-foreground mb-3">Fizetési határidők</h3>
          <div className="flex gap-6 flex-wrap">
            {(stats.overdue ?? 0) > 0 && (
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />
                <span className="text-[13px] font-semibold text-red-600">Lejárt: {stats.overdue} db</span>
              </div>
            )}
            {(stats.due_soon ?? 0) > 0 && (
              <div className="flex items-center gap-2">
                <Clock size={14} className="text-amber-500 flex-shrink-0" />
                <span className="text-[13px] font-semibold text-amber-600">3 napon belül esedékes: {stats.due_soon} db</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Status breakdown */}
      {stats.total > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-[13px] font-semibold text-foreground mb-4">Státusz megoszlás</h3>
          <div className="space-y-3">
            {STATUS_BAR.map(s => {
              const val = stats[s.key] ?? 0
              const pct = Math.round((val / total) * 100)
              return (
                <div key={s.key}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[12px] text-muted-foreground">{s.label}</span>
                    <span className="text-[12px] font-medium text-foreground tabular-nums">{val} ({pct}%)</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${s.color} transition-all duration-500`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

    </div>
  )
}
