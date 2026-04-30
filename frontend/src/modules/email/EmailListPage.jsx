import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { useGet } from "@/core/hooks/useApi"
import { ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react"

// ── Status config ──────────────────────────────────────────────
const STATUS_CFG = {
  new:              { label: "Új",                bg: "bg-blue-50",    text: "text-blue-700",    border: "border-blue-200"    },
  ai_answered:      { label: "AI válasz",         bg: "bg-purple-50",  text: "text-purple-700",  border: "border-purple-200"  },
  needs_attention:  { label: "Figyelmet igényel", bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200"   },
  approved:         { label: "Jóváhagyva",        bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  rejected:         { label: "Elutasítva",        bg: "bg-red-50",     text: "text-red-700",     border: "border-red-200"     },
  sent:             { label: "Elküldve",          bg: "bg-teal-50",    text: "text-teal-700",    border: "border-teal-200"    },
  closed:           { label: "Lezárt",            bg: "bg-gray-100",   text: "text-gray-600",    border: "border-gray-200"    },
}

// ── Category config ────────────────────────────────────────────
const CAT_CFG = {
  customer_complaint: { label: "Panasz",     bg: "bg-red-50",     text: "text-red-700",    border: "border-red-200"    },
  invoice_payment:    { label: "Számlázás",  bg: "bg-blue-50",    text: "text-blue-700",   border: "border-blue-200"   },
  meeting_request:    { label: "Találkozó",  bg: "bg-violet-50",  text: "text-violet-700", border: "border-violet-200" },
  general_inquiry:    { label: "Érdeklődés", bg: "bg-gray-100",   text: "text-gray-600",   border: "border-gray-200"   },
  auto_forward:       { label: "Továbbítás", bg: "bg-gray-100",   text: "text-gray-500",   border: "border-gray-200"   },
  other:              { label: "Egyéb",      bg: "bg-gray-100",   text: "text-gray-500",   border: "border-gray-200"   },
}

const FILTER_TABS = [
  { key: null,              label: "Mind"               },
  { key: "new",             label: "Új"                 },
  { key: "ai_answered",     label: "AI válasz"          },
  { key: "needs_attention", label: "Figyelmet igényel"  },
  { key: "approved",        label: "Jóváhagyva"         },
  { key: "sent",            label: "Elküldve"           },
  { key: "closed",          label: "Lezárt"             },
]

// ── Helpers ────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("hu-HU", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
}

function Badge({ cfg, label }) {
  const c = cfg ?? { label: label || "—", bg: "bg-gray-100", text: "text-gray-500", border: "border-gray-200" }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${c.bg} ${c.text} ${c.border}`}>
      {c.label}
    </span>
  )
}

function ConfBar({ value }) {
  const pct   = Math.round((value ?? 0) * 100)
  const color = pct >= 85 ? "bg-emerald-500" : pct >= 65 ? "bg-amber-400" : "bg-red-400"
  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] text-muted-foreground tabular-nums w-7">{pct}%</span>
    </div>
  )
}

function UrgencyBar({ score, urgent }) {
  const pct   = score ?? 0
  const color = pct >= 75 ? "bg-red-500" : pct >= 50 ? "bg-amber-400" : "bg-emerald-400"
  return (
    <div className="flex items-center gap-1.5 min-w-[70px]">
      {urgent && <AlertTriangle size={11} className="text-red-500 flex-shrink-0" />}
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] text-muted-foreground tabular-nums w-5">{pct}</span>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────
export default function EmailListPage({ defaultStatus = null }) {
  const [statusFilter, setStatusFilter] = useState(defaultStatus)
  const [page, setPage]                 = useState(1)
  const navigate     = useNavigate()
  const queryClient  = useQueryClient()

  const url = `/email/list?page=${page}&per_page=20${statusFilter ? `&status=${statusFilter}` : ""}`
  const { data, isLoading, error } = useGet(["emails-list", statusFilter, page], url)

  const emails     = data?.items ?? []
  const total      = data?.total ?? 0
  const totalPages = data?.pages ?? 1

  function handleStatusChange(key) {
    setStatusFilter(key)
    setPage(1)
  }

  if (error) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center">
        <p className="text-[13px] text-red-500">Nem sikerült betölteni az emaileket</p>
      </div>
    )
  }

  return (
    <>
      {/* Filter tabs */}
      <div className="flex gap-1 flex-wrap items-center">
        {FILTER_TABS.map(t => (
          <button
            key={String(t.key)}
            onClick={() => handleStatusChange(t.key)}
            className={[
              "px-3 py-1.5 text-[12px] font-medium rounded-lg border transition-all duration-150",
              statusFilter === t.key
                ? "bg-foreground text-background border-foreground"
                : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-foreground/20",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
        {total > 0 && (
          <span className="ml-auto text-[11px] text-muted-foreground">{total} email</span>
        )}
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-[13px] text-muted-foreground">Betöltés…</div>
        ) : emails.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-[13px] text-muted-foreground">Nincs email</p>
            <p className="text-[11px] text-muted-foreground/60 mt-1">Az emailek automatikusan kerülnek ide</p>
          </div>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <Th>Feladó</Th>
                <Th>Tárgy</Th>
                <Th>Kategória</Th>
                <Th>Állapot</Th>
                <Th>Sürgősség</Th>
                <Th>Megbízhatóság</Th>
                <Th>Beérkezett</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {emails.map(email => (
                <tr
                  key={email.id}
                  onClick={() => navigate(`/email/${email.id}`)}
                  className="transition-colors duration-100 cursor-pointer hover:bg-muted/30"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground truncate max-w-[160px]">
                      {email.sender || "—"}
                    </div>
                    {email.recipient && (
                      <div className="text-[11px] text-muted-foreground truncate max-w-[160px]">→ {email.recipient}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-foreground truncate max-w-[240px]">{email.subject || "(nincs tárgy)"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge cfg={CAT_CFG[email.category]} label={email.category} />
                  </td>
                  <td className="px-4 py-3">
                    <Badge cfg={STATUS_CFG[email.status]} label={email.status} />
                  </td>
                  <td className="px-4 py-3">
                    <UrgencyBar score={email.urgency_score} urgent={email.urgent} />
                  </td>
                  <td className="px-4 py-3">
                    <ConfBar value={email.confidence} />
                  </td>
                  <td className="px-4 py-3 text-[12px] text-muted-foreground whitespace-nowrap">
                    {fmtDate(email.created_at)}
                  </td>
                  <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => navigate(`/email/${email.id}`)}
                      className="text-[12px] font-medium text-blue-600 hover:text-blue-700 transition-colors"
                    >
                      Megnyit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            disabled={page === 1}
            onClick={() => setPage(p => p - 1)}
            className="p-1.5 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="text-[12px] text-muted-foreground">{page} / {totalPages}</span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
            className="p-1.5 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </>
  )
}

function Th({ children, align = "left" }) {
  return (
    <th className={`px-4 py-2.5 text-[11px] font-semibold text-muted-foreground text-${align}`}>
      {children}
    </th>
  )
}
