import { useState, useEffect } from "react"
import { useGet } from "@/core/hooks/useApi"
import { Sparkles, ChevronRight, Check, X } from "lucide-react"
import { Button } from "@/components/ui/Button"

// ── Type badge config ──────────────────────────────────────────
const TYPE_CONFIG = {
  invoice: { label: "invoice", style: "text-blue-600 bg-blue-50 border-blue-200"       },
  email:   { label: "email",   style: "text-violet-600 bg-violet-50 border-violet-200" },
}

function getTypeConfig(resourceType) {
  const key = (resourceType || "").toLowerCase()
  return TYPE_CONFIG[key] || { label: key || "item", style: "text-slate-600 bg-slate-50 border-slate-200" }
}

// ── Confidence helpers (value is 0-1 float from API) ──────────
function toPercent(v) { return Math.round((v ?? 0) * 100) }

function confidenceLevel(pct) {
  if (pct >= 85) return { label: "HIGH",   textColor: "text-emerald-600", stroke: "#10b981" }
  if (pct >= 65) return { label: "MEDIUM", textColor: "text-amber-600",   stroke: "#f59e0b" }
  return               { label: "LOW",    textColor: "text-red-500",     stroke: "#ef4444" }
}

// ── Circular SVG confidence ring ───────────────────────────────
function ConfidenceRing({ value }) {
  const pct  = toPercent(value)
  const r    = 44
  const circ = 2 * Math.PI * r
  const { label, textColor, stroke } = confidenceLevel(pct)

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative w-28 h-28">
        <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={r} fill="none" stroke="#e5e7eb" strokeWidth="8" />
          <circle
            cx="50" cy="50" r={r} fill="none"
            stroke={stroke} strokeWidth="8"
            strokeDasharray={`${(pct / 100) * circ} ${circ}`}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[20px] font-bold text-foreground">{pct}%</span>
        </div>
      </div>
      <span className={`text-[11px] font-bold tracking-wider ${textColor}`}>{label}</span>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────
export default function ApprovalsPage() {
  const { data, isLoading } = useGet("approvals", "/core/approve?status=pending")
  const items        = data?.items ?? []
  const pendingTotal = data?.total ?? items.length

  const [selectedId, setSelectedId] = useState(null)

  useEffect(() => {
    if (items.length > 0 && selectedId === null) {
      setSelectedId(items[0].id)
    }
  }, [items, selectedId])

  const selected = items.find(i => i.id === selectedId) ?? items[0] ?? null

  if (!isLoading && items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
        <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center">
          <Check size={20} className="text-emerald-500" />
        </div>
        <p className="text-[15px] font-semibold text-foreground">All caught up</p>
        <p className="text-[13px] text-muted-foreground">No items awaiting approval.</p>
      </div>
    )
  }

  return (
    <div className="max-w-[1200px] mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-semibold text-foreground tracking-tight">Approval Queue</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">AI-reviewed items awaiting your decision</p>
        </div>
        {pendingTotal > 0 && (
          <span className="text-[11px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-full">
            {pendingTotal} pending
          </span>
        )}
      </div>

      {/* ── Master-detail layout ── */}
      <div className="grid grid-cols-[300px_1fr] gap-4 min-h-[520px]">

        {/* Left: item list */}
        <div className="bg-card border border-border rounded-xl overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-border flex-shrink-0">
            <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
              Items
            </span>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-border">
            {isLoading && (
              <div className="p-8 text-center text-[12px] text-muted-foreground">Loading…</div>
            )}
            {items.map(item => (
              <ApprovalListItem
                key={item.id}
                item={item}
                isSelected={item.id === selected?.id}
                onClick={() => setSelectedId(item.id)}
              />
            ))}
          </div>
        </div>

        {/* Right: detail panel */}
        {selected ? (
          <DetailPanel item={selected} />
        ) : !isLoading && (
          <div className="bg-card border border-border rounded-xl flex items-center justify-center text-[13px] text-muted-foreground">
            Select an item to review
          </div>
        )}

      </div>
    </div>
  )
}

// ── ApprovalListItem ───────────────────────────────────────────
function ApprovalListItem({ item, isSelected, onClick }) {
  const { label, style } = getTypeConfig(item.resource_type)
  const pct       = toPercent(item.confidence)
  const barColor  = pct >= 85 ? "bg-emerald-500" : pct >= 65 ? "bg-amber-400" : "bg-red-400"
  const displayId = item.reference_id || (item.id ? String(item.id).slice(0, 14) : "—")
  const timeAgo   = item.created_at_rel || ""

  return (
    <button
      onClick={onClick}
      className={[
        "w-full text-left px-4 py-4 transition-all border-l-2",
        isSelected
          ? "bg-blue-50/60 border-l-blue-500"
          : "border-l-transparent hover:bg-muted/30",
      ].join(" ")}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-[13px] font-semibold text-foreground truncate mr-2">{displayId}</span>
        <span className={`flex-shrink-0 text-[10px] font-medium border px-2 py-0.5 rounded-full ${style}`}>
          {label}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground mb-2.5 line-clamp-2">{item.summary}</p>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div className="w-16 h-1 bg-muted rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[10px] text-muted-foreground">{pct}%</span>
        </div>
        {timeAgo && <span className="text-[10px] text-muted-foreground/60">{timeAgo}</span>}
      </div>
    </button>
  )
}

// ── DetailPanel ────────────────────────────────────────────────
function DetailPanel({ item }) {
  const meta        = item.metadata || item.payload || {}
  const displayId   = item.reference_id || (item.id ? String(item.id).slice(0, 14) : "—")
  const classification = meta.classification || item.classification
    || (item.resource_type ? item.resource_type.replace(/_/g, " ") : "Unknown")
  const reasoning   = item.reasoning || meta.reasoning || ""

  const extractedRows = [
    { key: "Vendor",   value: meta.vendor   || item.vendor   },
    { key: "Amount",   value: meta.amount   || item.amount   },
    { key: "VAT",      value: meta.vat      || item.vat      },
    { key: "Due Date", value: meta.due_date || item.due_date },
  ].filter(r => r.value != null && r.value !== "")

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden flex flex-col">

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
            <Sparkles size={14} className="text-purple-600" />
          </div>
          <div>
            <p className="text-[14px] font-semibold text-foreground">AI Analysis</p>
            <p className="text-[11px] text-muted-foreground">Automated review · {displayId}</p>
          </div>
        </div>
        <ConfidenceRing value={item.confidence} />
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

        {/* Classification */}
        <div>
          <PanelSectionLabel>Classification</PanelSectionLabel>
          <div className="mt-2">
            <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-blue-600 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg">
              <Sparkles size={11} />
              {classification.replace(/\b\w/g, l => l.toUpperCase())}
            </span>
          </div>
        </div>

        {/* Extracted data */}
        {extractedRows.length > 0 && (
          <div>
            <PanelSectionLabel>Extracted Data</PanelSectionLabel>
            <div className="mt-2 border border-border rounded-xl overflow-hidden">
              {extractedRows.map(({ key, value }, i) => (
                <div
                  key={key}
                  className={`flex items-center px-4 py-3 text-[13px] ${i < extractedRows.length - 1 ? "border-b border-border" : ""}`}
                >
                  <span className="w-24 text-muted-foreground font-medium flex-shrink-0">{key}</span>
                  <span className="text-foreground">{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI Reasoning */}
        {reasoning && (
          <div>
            <PanelSectionLabel>AI Reasoning</PanelSectionLabel>
            <div className="mt-2 bg-muted/50 border border-border rounded-xl p-4">
              <p className="text-[12px] text-muted-foreground leading-relaxed italic">"{reasoning}"</p>
            </div>
          </div>
        )}

      </div>

      {/* Action bar */}
      <div className="px-6 py-4 border-t border-border flex items-center gap-3 flex-shrink-0">
        <Button variant="primary" size="md" className="flex items-center gap-1.5">
          <Check size={13} /> Approve
        </Button>
        <Button variant="danger" size="md" className="flex items-center gap-1.5">
          <X size={13} /> Reject
        </Button>
        <Button variant="outline" size="md">Request Info</Button>
        <div className="flex-1" />
        <button className="flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors">
          Skip <ChevronRight size={13} />
        </button>
      </div>

    </div>
  )
}

// ── PanelSectionLabel ──────────────────────────────────────────
function PanelSectionLabel({ children }) {
  return (
    <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">{children}</p>
  )
}
