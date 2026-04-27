import { useState, useRef, useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useGet } from "@/core/hooks/useApi"
import { ConfidenceBar } from "@/components/ui/ConfidenceBar"
import { CheckCircle, ChevronLeft, ChevronRight, Download, Loader2 } from "lucide-react"
import InvoiceDetail from "./InvoiceDetail"

const STATUS_CONFIG = {
  extracted:      { label: "Kinyerve",       bg: "bg-gray-100",    text: "text-gray-600",    border: "border-gray-200" },
  pending_review: { label: "Felülvizsgálat", bg: "bg-amber-50",    text: "text-amber-700",   border: "border-amber-200" },
  verified:       { label: "Ellenőrizve",    bg: "bg-blue-50",     text: "text-blue-700",    border: "border-blue-200" },
  exported:       { label: "Exportálva",     bg: "bg-emerald-50",  text: "text-emerald-700", border: "border-emerald-200" },
  rejected:       { label: "Elutasítva",     bg: "bg-red-50",      text: "text-red-700",     border: "border-red-200" },
}

const FILTER_TABS = [
  { key: null,             label: "Mind" },
  { key: "pending_review", label: "Felülvizsgálat" },
  { key: "extracted",      label: "Kinyerve" },
  { key: "verified",       label: "Ellenőrizve" },
  { key: "exported",       label: "Exportálva" },
  { key: "rejected",       label: "Elutasítva" },
]

function defaultDateRange() {
  const now   = new Date()
  const from  = new Date(now.getFullYear(), now.getMonth(), 1)
  const fmt   = d => d.toISOString().slice(0, 10)
  return { from: fmt(from), to: fmt(now) }
}

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
      link.download = `szamlak_${new Date().toISOString().slice(0, 10)}.${ext}`
      link.click()
      URL.revokeObjectURL(link.href)
    } catch (err) {
      alert("Export sikertelen: " + err.message)
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
        {exporting ? "Exportálás..." : "Exportálás"}
        {!exporting && <span style={{ fontSize: 9 }}>▾</span>}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 bg-card border border-border rounded-xl shadow-lg z-50 overflow-hidden"
          style={{ minWidth: 260 }}
        >
          {/* Excel */}
          <button
            onClick={() => doExport("excel")}
            className="w-full text-left px-4 py-3 hover:bg-muted transition-colors border-b border-border"
          >
            <div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
              <span>📊</span> Excel export (.xlsx)
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5 pl-5">2 munkalap: számlák + ÁFA</div>
          </button>

          {/* CSV */}
          <button
            onClick={() => doExport("csv")}
            className="w-full text-left px-4 py-3 hover:bg-muted transition-colors border-b border-border"
          >
            <div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
              <span>📄</span> CSV export (.csv)
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5 pl-5">Könyvelőprogramhoz</div>
          </button>

          {/* PDF — date range picker inline */}
          <div className="px-4 py-3">
            <div className="flex items-center gap-2 text-[13px] font-medium text-foreground mb-2">
              <span>📋</span> PDF összesítő
            </div>
            <div className="flex gap-2 mb-2">
              <div style={{ flex: 1 }}>
                <div className="text-[10px] text-muted-foreground mb-0.5">Kezdő dátum</div>
                <input
                  type="date"
                  value={pdfDates.from}
                  onChange={e => setPdfDates(p => ({ ...p, from: e.target.value }))}
                  onClick={e => e.stopPropagation()}
                  className="w-full text-[12px] border border-border rounded-lg px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div style={{ flex: 1 }}>
                <div className="text-[10px] text-muted-foreground mb-0.5">Befejező dátum</div>
                <input
                  type="date"
                  value={pdfDates.to}
                  onChange={e => setPdfDates(p => ({ ...p, to: e.target.value }))}
                  onClick={e => e.stopPropagation()}
                  className="w-full text-[12px] border border-border rounded-lg px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
            <button
              onClick={() => doExport("pdf-summary", { date_from: pdfDates.from, date_to: pdfDates.to })}
              className="w-full flex items-center justify-center gap-1.5 py-2 text-[12px] font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
            >
              <Download size={12} /> PDF letöltése
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function DueDateBadge({ dueDate }) {
  if (!dueDate) return <span className="text-muted-foreground">—</span>
  const today = new Date()
  const due   = new Date(dueDate)
  const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, fontWeight: 600, padding: "1px 7px", borderRadius: 999, background: "#fee2e2", color: "#dc2626" }}>
        ⚠ Lejárt {Math.abs(diffDays)} napja
      </span>
    )
  }
  if (diffDays <= 3) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, fontWeight: 600, padding: "1px 7px", borderRadius: 999, background: "#fef3c7", color: "#d97706" }}>
        ⏰ {diffDays} nap múlva
      </span>
    )
  }
  if (diffDays <= 7) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, fontWeight: 600, padding: "1px 7px", borderRadius: 999, background: "#fef9c3", color: "#ca8a04" }}>
        📅 {diffDays} nap
      </span>
    )
  }
  return <span className="text-muted-foreground">{fmtDate(dueDate)}</span>
}

function fmt(n) {
  if (n == null) return "—"
  return Number(n).toLocaleString("hu-HU") + " Ft"
}

function fmtDate(d) {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("hu-HU", { year: "numeric", month: "2-digit", day: "2-digit" })
}

export default function InvoiceList() {
  const [statusFilter, setStatusFilter] = useState(null)
  const [page, setPage]                 = useState(1)
  const [selectedId, setSelectedId]     = useState(null)
  const queryClient = useQueryClient()

  const url = `/invoice/list?page=${page}&per_page=20${statusFilter ? `&status=${statusFilter}` : ""}`
  const { data, isLoading, error } = useGet(["invoices-list", statusFilter, page], url)

  const invoices  = data?.items ?? []
  const total     = data?.total ?? 0
  const totalPages = data?.pages ?? 1

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["invoices-list"] })
    queryClient.invalidateQueries({ queryKey: ["invoice-stats"] })
  }

  function handleStatusChange(key) {
    setStatusFilter(key)
    setPage(1)
  }

  if (error) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center">
        <p className="text-[13px] text-red-500">Hiba az adatok betöltésekor</p>
      </div>
    )
  }

  return (
    <>
      {/* Filter tabs */}
      <div className="flex gap-1 flex-wrap">
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
            <span className="text-[11px] text-muted-foreground">{total} rekord</span>
          )}
          <ExportButton statusFilter={statusFilter} />
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-[13px] text-muted-foreground">Betöltés...</div>
        ) : invoices.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-[13px] text-muted-foreground">Nincs megjeleníthető számla</p>
            <p className="text-[11px] text-muted-foreground/60 mt-1">Töltsön fel egy számlát a feldolgozáshoz</p>
          </div>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <Th>Szállító</Th>
                <Th align="right">Bruttó</Th>
                <Th align="right">ÁFA</Th>
                <Th>Esedékesség</Th>
                <Th>Státusz</Th>
                <Th>Biztonság</Th>
                <Th>Műveletek</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {invoices.map(inv => {
                const sc = STATUS_CONFIG[inv.status] ?? STATUS_CONFIG.extracted
                return (
                  <tr
                    key={inv.id}
                    onClick={() => setSelectedId(inv.id)}
                    className="hover:bg-muted/30 transition-colors duration-100 cursor-pointer"
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
                      <ConfidenceBar value={inv.confidence} />
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        {inv.status === "pending_review" && (
                          <button
                            onClick={() => setSelectedId(inv.id)}
                            className="flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-700 px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                          >
                            <CheckCircle size={12} />
                            Ellenőrzés
                          </button>
                        )}
                        <button
                          onClick={() => setSelectedId(inv.id)}
                          className="text-[11px] text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors"
                        >
                          Részletek
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
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

      {/* Detail panel */}
      {selectedId && (
        <InvoiceDetail
          invoiceId={selectedId}
          onClose={() => setSelectedId(null)}
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
