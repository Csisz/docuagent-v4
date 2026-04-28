import { useState, useRef, useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useGet } from "@/core/hooks/useApi"
import { api } from "@/core/api"
import { CheckCircle, ChevronLeft, ChevronRight, Download, Loader2, X } from "lucide-react"
import InvoiceDetail from "./InvoiceDetail"

// ── Status config ──────────────────────────────────────────────
const STATUS_CONFIG = {
  extracted:      { label: "Extracted", bg: "bg-gray-100",    text: "text-gray-600",    border: "border-gray-200"  },
  pending_review: { label: "Review",    bg: "bg-amber-50",    text: "text-amber-700",   border: "border-amber-200" },
  verified:       { label: "Verified",  bg: "bg-blue-50",     text: "text-blue-700",    border: "border-blue-200"  },
  exported:       { label: "Exported",  bg: "bg-emerald-50",  text: "text-emerald-700", border: "border-emerald-200" },
  rejected:       { label: "Rejected",  bg: "bg-red-50",      text: "text-red-700",     border: "border-red-200"   },
}

const FILTER_TABS = [
  { key: null,             label: "All"       },
  { key: "pending_review", label: "Review"    },
  { key: "extracted",      label: "Extracted" },
  { key: "verified",       label: "Verified"  },
  { key: "exported",       label: "Exported"  },
  { key: "rejected",       label: "Rejected"  },
]

// ── Helpers ────────────────────────────────────────────────────
function defaultDateRange() {
  const now  = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1)
  const fmt  = d => d.toISOString().slice(0, 10)
  return { from: fmt(from), to: fmt(now) }
}

function fmt(n) {
  if (n == null) return "—"
  return Number(n).toLocaleString("hu-HU") + " Ft"
}

function fmtDate(d) {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("hu-HU", { year: "numeric", month: "2-digit", day: "2-digit" })
}

function toPercent(v) { return Math.round((v ?? 0) * 100) }

// ── Due date badge ─────────────────────────────────────────────
function DueDateBadge({ dueDate }) {
  if (!dueDate) return <span className="text-muted-foreground">—</span>
  const today    = new Date()
  const due      = new Date(dueDate)
  const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24))

  if (diffDays < 0) {
    return (
      <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">
        {Math.abs(diffDays)}d overdue
      </span>
    )
  }
  if (diffDays <= 3) {
    return (
      <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">
        {diffDays}d left
      </span>
    )
  }
  if (diffDays <= 7) {
    return (
      <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200">
        {diffDays}d
      </span>
    )
  }
  return <span className="text-[12px] text-muted-foreground">{fmtDate(dueDate)}</span>
}

// ── Confidence bar ─────────────────────────────────────────────
function ConfBar({ value }) {
  const pct   = toPercent(value)
  const color = pct >= 85 ? "bg-emerald-500" : pct >= 65 ? "bg-amber-400" : "bg-red-400"
  return (
    <div className="flex items-center gap-2 min-w-[90px]">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] text-muted-foreground tabular-nums w-8">{pct}%</span>
    </div>
  )
}

// ── Mini confidence ring for side panel ───────────────────────
function MiniRing({ value }) {
  const pct   = toPercent(value)
  const r     = 36
  const circ  = 2 * Math.PI * r
  const color = pct >= 85 ? "#10b981" : pct >= 65 ? "#f59e0b" : "#ef4444"
  const lvl   = pct >= 85 ? "HIGH"   : pct >= 65 ? "MEDIUM" : "LOW"
  const lvlCl = pct >= 85 ? "text-emerald-600" : pct >= 65 ? "text-amber-600" : "text-red-500"

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative w-20 h-20">
        <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r={r} fill="none" stroke="#e5e7eb" strokeWidth="7" />
          <circle cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="7"
            strokeDasharray={`${(pct / 100) * circ} ${circ}`} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[15px] font-bold text-foreground">{pct}%</span>
        </div>
      </div>
      <span className={`text-[10px] font-bold tracking-wider ${lvlCl}`}>{lvl}</span>
    </div>
  )
}

// ── Export button (dropdown) ───────────────────────────────────
function ExportButton({ statusFilter }) {
  const [open,      setOpen]      = useState(false)
  const [exporting, setExporting] = useState(false)
  const [pdfDates,  setPdfDates]  = useState(defaultDateRange)
  const ref = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  async function doExport(format, extraParams = {}) {
    setExporting(true)
    setOpen(false)
    try {
      const token  = localStorage.getItem("access_token")
      const params = new URLSearchParams()
      if (statusFilter) params.set("status", statusFilter)
      Object.entries(extraParams).forEach(([k, v]) => { if (v) params.set(k, v) })
      const url = `/invoice/export/${format}?${params}`
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.detail || `HTTP ${res.status}`)
      }
      const blob = await res.blob()
      const ext  = { excel: "xlsx", csv: "csv", "pdf-summary": "pdf" }[format] ?? format
      const link = document.createElement("a")
      link.href  = URL.createObjectURL(blob)
      link.download = `invoices_${new Date().toISOString().slice(0, 10)}.${ext}`
      link.click()
      URL.revokeObjectURL(link.href)
    } catch (err) {
      alert("Export failed: " + err.message)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(v => !v)}
        disabled={exporting}
        className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-all duration-150 disabled:opacity-50"
      >
        {exporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
        {exporting ? "Exporting..." : "Export"}
        {!exporting && <span style={{ fontSize: 9 }}>▾</span>}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 bg-card border border-border rounded-xl shadow-lg z-50 overflow-hidden" style={{ minWidth: 260 }}>
          <button
            onClick={() => doExport("excel")}
            className="w-full text-left px-4 py-3 hover:bg-muted transition-colors border-b border-border"
          >
            <div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
              <span>📊</span> Excel (.xlsx)
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5 pl-5">2 sheets: invoices + VAT</div>
          </button>
          <button
            onClick={() => doExport("csv")}
            className="w-full text-left px-4 py-3 hover:bg-muted transition-colors border-b border-border"
          >
            <div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
              <span>📄</span> CSV (.csv)
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5 pl-5">For accounting software</div>
          </button>
          <div className="px-4 py-3">
            <div className="flex items-center gap-2 text-[13px] font-medium text-foreground mb-2">
              <span>📋</span> PDF Summary
            </div>
            <div className="flex gap-2 mb-2">
              <div style={{ flex: 1 }}>
                <div className="text-[10px] text-muted-foreground mb-0.5">From</div>
                <input type="date" value={pdfDates.from}
                  onChange={e => setPdfDates(p => ({ ...p, from: e.target.value }))}
                  onClick={e => e.stopPropagation()}
                  className="w-full text-[12px] border border-border rounded-lg px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
              <div style={{ flex: 1 }}>
                <div className="text-[10px] text-muted-foreground mb-0.5">To</div>
                <input type="date" value={pdfDates.to}
                  onChange={e => setPdfDates(p => ({ ...p, to: e.target.value }))}
                  onClick={e => e.stopPropagation()}
                  className="w-full text-[12px] border border-border rounded-lg px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
            </div>
            <button
              onClick={() => doExport("pdf-summary", { date_from: pdfDates.from, date_to: pdfDates.to })}
              className="w-full flex items-center justify-center gap-1.5 py-2 text-[12px] font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
            >
              <Download size={12} /> Download PDF
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Side panel ─────────────────────────────────────────────────
function InvoicePreviewPanel({ invoice, onClose, onOpenDetail, onRefresh }) {
  const [verifying, setVerifying] = useState(false)
  const [error, setError]         = useState("")
  const sc       = STATUS_CONFIG[invoice.status] ?? STATUS_CONFIG.extracted
  const canVerify = ["extracted", "pending_review"].includes(invoice.status)
  const canExport = invoice.status === "verified"

  async function handleVerify() {
    setVerifying(true)
    setError("")
    try {
      await api.post(`/invoice/${invoice.id}/verify`, { note: "" })
      onRefresh()
      onClose()
    } catch (err) {
      setError(err.response?.data?.detail || "Verification failed")
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden flex flex-col sticky top-0">
      {/* Header */}
      <div className="flex items-start justify-between px-4 py-3.5 border-b border-border">
        <div>
          <p className="text-[14px] font-semibold text-foreground">{invoice.vendor_name || "—"}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{invoice.invoice_number || "—"}</p>
        </div>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-all flex-shrink-0 mt-0.5"
        >
          <X size={13} />
        </button>
      </div>

      {/* Confidence + status */}
      <div className="flex items-center gap-4 px-4 py-4 border-b border-border">
        <MiniRing value={invoice.confidence} />
        <div>
          <span className={`inline-flex items-center text-[10px] font-semibold border px-2 py-0.5 rounded-full ${sc.bg} ${sc.text} ${sc.border}`}>
            {sc.label}
          </span>
          {invoice.due_date && (
            <p className="text-[11px] text-muted-foreground mt-1.5">Due {fmtDate(invoice.due_date)}</p>
          )}
        </div>
      </div>

      {/* Data boxes */}
      <div className="grid grid-cols-2 gap-2 p-4 border-b border-border">
        {[
          { label: "Amount",    value: fmt(invoice.amount_gross) },
          { label: "VAT",       value: fmt(invoice.amount_vat)   },
          { label: "Due Date",  value: fmtDate(invoice.due_date) },
          { label: "Invoice #", value: invoice.invoice_number || "—" },
        ].map(({ label, value }) => (
          <div key={label} className="bg-muted/50 rounded-lg p-2.5">
            <p className="text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-0.5">{label}</p>
            <p className="text-[12px] font-semibold text-foreground tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mt-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-[11px] text-red-700">{error}</div>
      )}

      {/* Actions */}
      <div className="p-4 flex gap-2">
        {canVerify && (
          <button
            onClick={handleVerify}
            disabled={verifying}
            className="flex-1 flex items-center justify-center gap-1.5 h-9 bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            <CheckCircle size={13} />
            {verifying ? "Verifying..." : "Verify"}
          </button>
        )}
        {canExport && (
          <button
            onClick={onOpenDetail}
            className="flex-1 flex items-center justify-center gap-1.5 h-9 bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-medium rounded-lg transition-colors"
          >
            <Download size={13} /> Export
          </button>
        )}
        {!canVerify && !canExport && (
          <button
            onClick={onOpenDetail}
            className="flex-1 flex items-center justify-center gap-1.5 h-9 border border-border text-[12px] text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
          >
            View details
          </button>
        )}
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────
export default function InvoiceList() {
  const [statusFilter, setStatusFilter] = useState(null)
  const [page, setPage]                 = useState(1)
  const [previewId, setPreviewId]       = useState(null)
  const [detailId, setDetailId]         = useState(null)
  const queryClient = useQueryClient()

  const url = `/invoice/list?page=${page}&per_page=20${statusFilter ? `&status=${statusFilter}` : ""}`
  const { data, isLoading, error } = useGet(["invoices-list", statusFilter, page], url)

  const invoices   = data?.items ?? []
  const total      = data?.total ?? 0
  const totalPages = data?.pages ?? 1
  const previewInv = invoices.find(i => i.id === previewId) ?? null

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["invoices-list"] })
    queryClient.invalidateQueries({ queryKey: ["invoice-stats"] })
  }

  function handleStatusChange(key) {
    setStatusFilter(key)
    setPage(1)
    setPreviewId(null)
  }

  if (error) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center">
        <p className="text-[13px] text-red-500">Failed to load invoices</p>
      </div>
    )
  }

  return (
    <>
      {/* Filter + Export row */}
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
        <div className="ml-auto flex items-center gap-3">
          {total > 0 && (
            <span className="text-[11px] text-muted-foreground">{total} records</span>
          )}
          <ExportButton statusFilter={statusFilter} />
        </div>
      </div>

      {/* Table + side panel */}
      <div className={previewInv ? "grid gap-4 items-start" : ""} style={previewInv ? { gridTemplateColumns: "1fr 320px" } : {}}>

        {/* Table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {isLoading ? (
            <div className="p-10 text-center text-[13px] text-muted-foreground">Loading…</div>
          ) : invoices.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-[13px] text-muted-foreground">No invoices found</p>
              <p className="text-[11px] text-muted-foreground/60 mt-1">Upload an invoice to get started</p>
            </div>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <Th>Vendor</Th>
                  <Th align="right">Amount</Th>
                  <Th align="right">VAT</Th>
                  <Th>Due Date</Th>
                  <Th>Status</Th>
                  <Th>AI Confidence</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invoices.map(inv => {
                  const sc      = STATUS_CONFIG[inv.status] ?? STATUS_CONFIG.extracted
                  const isActive = inv.id === previewId
                  return (
                    <tr
                      key={inv.id}
                      onClick={() => setPreviewId(isActive ? null : inv.id)}
                      className={[
                        "transition-colors duration-100 cursor-pointer",
                        isActive ? "bg-blue-50/60" : "hover:bg-muted/30",
                      ].join(" ")}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground truncate max-w-[180px]">
                          {inv.vendor_name || "—"}
                        </div>
                        {inv.invoice_number && (
                          <div className="text-[11px] text-muted-foreground">{inv.invoice_number}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums">
                        {fmt(inv.amount_gross)}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">
                        {fmt(inv.amount_vat)}
                      </td>
                      <td className="px-4 py-3">
                        <DueDateBadge dueDate={inv.due_date} />
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${sc.bg} ${sc.text} ${sc.border}`}>
                          {sc.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <ConfBar value={inv.confidence} />
                      </td>
                      <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => setDetailId(inv.id)}
                          className="text-[12px] font-medium text-blue-600 hover:text-blue-700 transition-colors"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Side panel */}
        {previewInv && (
          <InvoicePreviewPanel
            invoice={previewInv}
            onClose={() => setPreviewId(null)}
            onOpenDetail={() => { setDetailId(previewId); setPreviewId(null) }}
            onRefresh={refresh}
          />
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

      {/* Full detail modal */}
      {detailId && (
        <InvoiceDetail
          invoiceId={detailId}
          onClose={() => setDetailId(null)}
          onUpdated={refresh}
        />
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
