import { useState, useEffect, useRef, useCallback, Fragment } from "react"
import {
  FileText, Image, Mail, FileSpreadsheet,
  Upload, Loader2, CheckCircle, AlertTriangle,
  XCircle, Clock, Zap, MoreHorizontal, Download, ExternalLink,
} from "lucide-react"
import InvoiceVisualValidator from "./InvoiceVisualValidator"
import { ConfirmModal } from "@/components/ui/ConfirmModal"

// ── Constants ─────────────────────────────────────────────────────

const ACCEPTED = ".pdf,.jpg,.jpeg,.png,.webp,.docx"
const MAX_BYTES = 10 * 1024 * 1024

const TERMINAL = new Set(["ocr_ready", "extracted", "pending_review", "verified", "exported", "rejected", "error"])

const STATUS_META = {
  uploading:      { label: "Feltöltés...",   color: "#64748b", spin: true  },
  extracting:     { label: "AI kinyerés...", color: "#2563eb", spin: true  },
  extracted:      { label: "Kinyerve",       color: "#2563eb", spin: false },
  pending_review: { label: "Felülvizsgálat", color: "#d97706", spin: false },
  ocr_processing: { label: "OCR térkép...",  color: "#2563eb", spin: true  },
  ocr_ready:      { label: "Kész",           color: "#16a34a", spin: false },
  verified:       { label: "Ellenőrizve",    color: "#2563eb", spin: false },
  exported:       { label: "Exportálva",     color: "#16a34a", spin: false },
  rejected:       { label: "Elutasítva",     color: "#dc2626", spin: false },
  error:          { label: "Hiba",           color: "#dc2626", spin: false },
}

function fmtAmt(n, cur = "HUF") {
  if (n == null) return null
  return Number(n).toLocaleString("hu-HU") + " " + cur
}

function fmtTime(iso) {
  if (!iso) return ""
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now - d
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1)  return "most"
  if (diffMin < 60) return `${diffMin} perce`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH} órája`
  return d.toLocaleDateString("hu-HU")
}

function DueDateBadge({ dueDate }) {
  if (!dueDate) return null
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
        ⏰ {diffDays} nap múlva esedékes
      </span>
    )
  }
  if (diffDays <= 7) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, fontWeight: 600, padding: "1px 7px", borderRadius: 999, background: "#fef9c3", color: "#ca8a04" }}>
        📅 {diffDays} nap ({dueDate})
      </span>
    )
  }
  return null
}

function fileIcon(inv) {
  const src = inv.source_type
  if (src === "email") return <Mail size={18} className="text-violet-500" />
  const fn = (inv.filename || inv.source_id || "").toLowerCase()
  if (fn.endsWith(".pdf")) return <FileText size={18} className="text-red-500" />
  if (fn.match(/\.(jpg|jpeg|png|webp)$/)) return <Image size={18} className="text-blue-500" />
  if (fn.match(/\.docx?$/)) return <FileSpreadsheet size={18} className="text-indigo-500" />
  return <FileText size={18} className="text-gray-400" />
}

function displayName(inv) {
  const name = inv.filename || (inv.source_id ? inv.source_id.split(/[\\/]/).pop() : null) || "Ismeretlen fájl"
  return name.length > 35 ? name.slice(0, 32) + "…" : name
}

// ── Main component ────────────────────────────────────────────────

export default function InvoiceQueue({ onRefreshStats, fileInputRef: externalFileInputRef }) {
  const [invoices,   setInvoices]   = useState([])
  const [loading,    setLoading]    = useState(true)
  const [dragging,   setDragging]   = useState(false)
  const [uploading,  setUploading]  = useState(false)   // file upload in progress
  const [selectedId, setSelectedId] = useState(null)    // for validator modal
  const [fullInvoice, setFullInvoice] = useState(null)  // full invoice for validator
  const [confirmDelete, setConfirmDelete] = useState(null)  // { invoiceId, invoiceName }

  const fileInputRef = useRef(null)
  const pollRef      = useRef({})   // { invoice_id: intervalId }
  const containerRef = useRef(null)

  // Sync external ref (from InvoicePage upload button) to the hidden input
  const setFileInputRef = useCallback(node => {
    fileInputRef.current = node
    if (externalFileInputRef) externalFileInputRef.current = node
  }, [externalFileInputRef])

  // ── API helpers ───────────────────────────────────────────────
  function authHeader() {
    const token = localStorage.getItem("access_token")
    return { Authorization: `Bearer ${token}` }
  }

  const fetchQueue = useCallback(async () => {
    try {
      const res  = await fetch("/invoice/queue?limit=50", { headers: authHeader() })
      const json = await res.json()
      const items = json?.data?.items ?? []
      setInvoices(items)
      // Start polling for any non-terminal invoices
      items.forEach(inv => {
        if (inv.id && !TERMINAL.has(inv.processing_status)) startPolling(inv.id)
      })
    } catch (_) {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    fetchQueue()
    return () => Object.values(pollRef.current).forEach(clearInterval)
  }, [fetchQueue])

  // ── Polling ───────────────────────────────────────────────────
  function startPolling(invoiceId) {
    if (!invoiceId || pollRef.current[invoiceId]) return
    pollRef.current[invoiceId] = setInterval(async () => {
      try {
        const res  = await fetch(`/invoice/${invoiceId}/status`, { headers: authHeader() })
        if (!res.ok) return
        const json = await res.json()
        const status = json?.data
        if (!status) return

        setInvoices(prev => prev.map(inv =>
          inv.id === invoiceId ? { ...inv, ...status } : inv
        ))

        if (TERMINAL.has(status.processing_status)) {
          clearInterval(pollRef.current[invoiceId])
          delete pollRef.current[invoiceId]
          onRefreshStats?.()
        }
      } catch (_) {}
    }, 2000)
  }

  // ── File upload ───────────────────────────────────────────────
  async function uploadFile(file) {
    const token = localStorage.getItem("access_token")
    const form  = new FormData()
    form.append("file", file)
    const res  = await fetch("/invoice/upload", {
      method:  "POST",
      headers: { Authorization: `Bearer ${token}` },
      body:    form,
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json?.detail || `HTTP ${res.status}`)
    return json?.data
  }

  async function handleFiles(files) {
    const validFiles = Array.from(files).filter(f => {
      const ext = f.name.split(".").pop().toLowerCase()
      return ["pdf","jpg","jpeg","png","webp","docx"].includes(ext) && f.size <= MAX_BYTES
    })
    if (!validFiles.length) return
    setUploading(true)

    for (const file of validFiles) {
      try {
        const data = await uploadFile(file)
        const stub = {
          id:                data.invoice_id,
          filename:          file.name,
          source_type:       "upload",
          processing_status: "uploading",
          preview_ready:     false,
          ocr_ready:         false,
          created_at:        new Date().toISOString(),
          updated_at:        new Date().toISOString(),
        }
        setInvoices(prev => [stub, ...prev])
        startPolling(data.invoice_id)
      } catch (err) {
        console.warn("Upload failed:", file.name, err)
      }
    }
    setUploading(false)
  }

  // ── Drag & drop ───────────────────────────────────────────────
  function onDragOver(e) { e.preventDefault(); setDragging(true) }
  function onDragLeave(e) {
    if (!containerRef.current?.contains(e.relatedTarget)) setDragging(false)
  }
  function onDrop(e) {
    e.preventDefault()
    setDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  // ── Open validator ────────────────────────────────────────────
  async function openValidator(inv) {
    if (!inv.id) return
    setSelectedId(inv.id)
    try {
      const res  = await fetch(`/invoice/${inv.id}`, { headers: authHeader() })
      if (!res.ok) { setFullInvoice(inv); return }
      const json = await res.json()
      setFullInvoice(json?.data ?? inv)
    } catch (_) {
      setFullInvoice(inv)
    }
  }

  function closeValidator() {
    setSelectedId(null)
    setFullInvoice(null)
    fetchQueue()
    onRefreshStats?.()
  }

  async function handleDelete(invoiceId) {
    const token = localStorage.getItem("access_token")
    const res = await fetch(`/invoice/${invoiceId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      setInvoices(prev => prev.filter(i => i.id !== invoiceId))
      onRefreshStats?.()
    }
    // errors surface via the modal's onConfirm rejection — queue stays intact
  }

  // ── Render ────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className="space-y-4"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Drop overlay */}
      {dragging && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-blue-500/10 border-4 border-dashed border-blue-400 pointer-events-none">
          <div className="bg-white rounded-2xl px-8 py-6 shadow-xl flex items-center gap-3">
            <Upload size={24} className="text-blue-500" />
            <span className="text-[15px] font-semibold text-blue-700">Engedje el a fájlokat</span>
          </div>
        </div>
      )}

      {/* Queue header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[15px] font-semibold text-foreground">Feldolgozási sor</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {invoices.length} számla · fájlokat ide is húzhat
          </p>
        </div>
        <div className="flex items-center gap-2">
          {uploading && (
            <span className="flex items-center gap-1.5 text-[12px] text-blue-600">
              <Loader2 size={12} className="animate-spin" /> Feltöltés...
            </span>
          )}
          <input
            ref={setFileInputRef}
            type="file"
            multiple
            accept={ACCEPTED}
            className="hidden"
            onChange={e => { handleFiles(e.target.files); e.target.value = "" }}
          />
        </div>
      </div>

      {/* Invoice cards */}
      {loading ? (
        <div className="bg-card border border-border rounded-xl p-10 text-center">
          <Loader2 size={20} className="animate-spin text-muted-foreground mx-auto mb-2" />
          <p className="text-[13px] text-muted-foreground">Betöltés...</p>
        </div>
      ) : invoices.length === 0 ? (
        <div className="bg-card border-2 border-dashed border-border rounded-xl p-12 text-center">
          <Upload size={28} className="text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-[14px] font-medium text-foreground">Nincs számla a sorban</p>
          <p className="text-[12px] text-muted-foreground mt-1">
            Kattintson a "Fájlok feltöltése" gombra, vagy húzza ide a fájlokat
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {invoices.map(inv => (
            <InvoiceCard
              key={inv.id}
              inv={inv}
              onValidate={() => openValidator(inv)}
              onDelete={() => setConfirmDelete({
                invoiceId: inv.id,
                invoiceName: inv.filename || inv.source_id?.split(/[\\/]/).pop() || inv.id,
              })}
            />
          ))}
        </div>
      )}

      {/* Delete confirmation modal */}
      <ConfirmModal
        isOpen={!!confirmDelete}
        icon="🗑"
        title="Számla törlése"
        message={`Biztosan törli a(z) "${confirmDelete?.invoiceName}" számlát? Ez a művelet nem visszavonható.`}
        confirmLabel="Törlés"
        confirmVariant="danger"
        onCancel={() => setConfirmDelete(null)}
        onConfirm={async () => {
          await handleDelete(confirmDelete.invoiceId)
          setConfirmDelete(null)
        }}
      />

      {/* Validator modal */}
      {selectedId && fullInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl w-full max-w-7xl" style={{ height: "90vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
              <div className="flex items-center gap-2">
                <Zap size={15} className="text-blue-500" />
                <h2 className="text-[15px] font-semibold text-foreground">
                  Számla validálása — {displayName(fullInvoice)}
                </h2>
              </div>
              <button
                onClick={closeValidator}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
              >
                <XCircle size={15} />
              </button>
            </div>
            <InvoiceVisualValidator
              invoice={fullInvoice}
              onSave={closeValidator}
              onClose={closeValidator}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Invoice card ──────────────────────────────────────────────────

function InvoiceCard({ inv, onValidate, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const ps   = inv.processing_status || "extracted"
  const meta = STATUS_META[ps] || STATUS_META.extracted
  const isProcessing = meta.spin
  const canValidate  = ["ocr_ready", "extracted", "pending_review"].includes(ps)
  const canExport    = inv.status === "verified"
  const hasError     = ps === "error"

  return (
    <div
      className={[
        "bg-card border rounded-xl p-4 transition-all duration-150",
        hasError ? "border-red-200 bg-red-50/30" : "border-border hover:border-border/80 hover:shadow-sm",
      ].join(" ")}
      style={hasError ? { borderLeftWidth: 3, borderLeftColor: "#dc2626" } : undefined}
    >
      <div className="flex items-start gap-3">
        {/* File icon */}
        <div className="w-9 h-9 rounded-lg bg-muted/50 border border-border flex items-center justify-center flex-shrink-0 mt-0.5">
          {fileIcon(inv)}
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Top row: filename + badge + time */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-foreground truncate max-w-[280px]">
              {displayName(inv)}
            </span>
            <StatusBadge ps={ps} meta={meta} />
            <span className="ml-auto text-[11px] text-muted-foreground flex-shrink-0">
              {fmtTime(inv.created_at)}
            </span>
          </div>

          {/* Status bar */}
          {!hasError && <InvoiceStatusBar invoice={inv} />}

          {/* Error message */}
          {hasError && (
            <div className="flex items-center gap-2 mt-1.5">
              {inv.processing_error && (
                <p className="text-[11px] text-red-600 flex items-center gap-1 flex-1 min-w-0">
                  <AlertTriangle size={10} className="flex-shrink-0" />
                  <span className="truncate">{inv.processing_error}</span>
                </p>
              )}
              <button className="text-[11px] text-red-600 hover:text-red-700 underline flex-shrink-0">
                Újrafeldolgozás
              </button>
            </div>
          )}

          {/* Due date badge */}
          {inv.due_date && (
            <div className="mt-1.5">
              <DueDateBadge dueDate={inv.due_date} />
            </div>
          )}

          {/* Billingo export badge */}
          {inv.status === "exported" && inv.export_system === "billingo" && inv.export_id && (
            <div className="mt-1.5">
              {inv.export_url ? (
                <a
                  href={inv.export_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border"
                  style={{ background: "#f0fdf4", color: "#15803d", borderColor: "#bbf7d0", textDecoration: "none" }}
                >
                  <ExternalLink size={9} />
                  Billingo #{inv.export_id}
                </a>
              ) : (
                <span
                  className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border"
                  style={{ background: "#f0fdf4", color: "#15803d", borderColor: "#bbf7d0" }}
                >
                  Billingo #{inv.export_id}
                </span>
              )}
            </div>
          )}

          {/* Metadata row */}
          <div className="flex items-center justify-between mt-2.5">
            <div className="text-[12px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
              {inv.vendor_name && <span className="font-medium text-foreground">{inv.vendor_name}</span>}
              {inv.amount_gross != null && (
                <>
                  {inv.vendor_name && <span>·</span>}
                  <span>{fmtAmt(inv.amount_gross, inv.currency)}</span>
                </>
              )}
              {inv.confidence != null && (
                <>
                  <span>·</span>
                  <span className={inv.confidence >= 0.75 ? "text-emerald-600" : "text-amber-600"}>
                    {Math.round(inv.confidence * 100)}%
                  </span>
                </>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {canValidate && (
                <button
                  onClick={onValidate}
                  className="flex items-center gap-1.5 h-8 px-3 bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-medium rounded-lg transition-colors"
                >
                  <Zap size={11} />
                  Validálás
                </button>
              )}
              {canExport && (
                <button className="flex items-center gap-1.5 h-8 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-medium rounded-lg transition-colors">
                  <Download size={11} />
                  Exportálás
                </button>
              )}
              {isProcessing && (
                <div className="w-8 h-8 flex items-center justify-center">
                  <Loader2 size={14} className="animate-spin text-blue-500" />
                </div>
              )}
              <div className="relative">
                <button
                  onClick={() => setMenuOpen(v => !v)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                >
                  <MoreHorizontal size={14} />
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-full mt-1 bg-card border border-border rounded-xl shadow-lg z-10 overflow-hidden min-w-[140px]">
                    <button
                      onClick={() => { setMenuOpen(false); onValidate() }}
                      className="w-full text-left px-4 py-2.5 text-[12px] hover:bg-muted transition-colors"
                    >
                      Megnyitás
                    </button>
                    <button
                      onClick={() => { setMenuOpen(false); onDelete() }}
                      className="w-full text-left px-4 py-2.5 text-[12px] text-red-600 hover:bg-red-50 transition-colors"
                    >
                      Törlés
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ ps, meta }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border"
      style={{
        color:           meta.color,
        backgroundColor: meta.color + "18",
        borderColor:     meta.color + "40",
      }}
    >
      {meta.spin && <Loader2 size={9} className="animate-spin" />}
      {!meta.spin && ps === "ocr_ready"  && <CheckCircle size={9} />}
      {!meta.spin && ps === "verified"   && <CheckCircle size={9} />}
      {!meta.spin && ps === "exported"   && <CheckCircle size={9} />}
      {!meta.spin && ps === "rejected"   && <XCircle size={9} />}
      {!meta.spin && ps === "error"      && <AlertTriangle size={9} />}
      {!meta.spin && ps === "pending_review" && <Clock size={9} />}
      {meta.label}
    </span>
  )
}

function InvoiceStatusBar({ invoice }) {
  const ps = invoice.processing_status || "uploading"

  const DONE_AFTER_EXTRACT = ["extracted","pending_review","ocr_processing","ocr_ready","verified","exported"]

  const stages = [
    {
      key:    "uploaded",
      label:  "Feltöltve",
      done:   true,
      active: false,
    },
    {
      key:    "extracting",
      label:  "AI kinyerés",
      done:   DONE_AFTER_EXTRACT.includes(ps),
      active: ps === "extracting",
    },
    {
      key:    "preview",
      label:  "Előnézet",
      done:   !!(invoice.preview_ready || DONE_AFTER_EXTRACT.includes(ps)),
      active: ps === "extracting" && !invoice.preview_ready,
    },
    {
      key:    "ready",
      label:  "Kész",
      done:   ["extracted","pending_review","ocr_processing","ocr_ready","verified","exported"].includes(ps),
      active: false,
    },
  ]

  const etaBadge = ps === "extracting" ? "~15 mp — AI elemzés" : null

  return (
    <div className="mt-3">
      <div className="flex items-start">
        {stages.map((stage, i) => (
          <Fragment key={stage.key}>
            <div className="flex flex-col items-center gap-1" style={{ minWidth: 46 }}>
              <div className={[
                "w-5 h-5 rounded-full flex items-center justify-center transition-all duration-300 flex-shrink-0",
                stage.done
                  ? "bg-emerald-500 shadow-sm"
                  : stage.active
                  ? "bg-blue-500"
                  : "bg-background border-2 border-border",
              ].join(" ")}>
                {stage.done && <CheckCircle size={11} className="text-white" />}
                {stage.active && !stage.done && <Loader2 size={10} className="text-white animate-spin" />}
              </div>
              <span className={[
                "text-[9px] font-medium text-center leading-tight",
                stage.done   ? "text-emerald-600"
                : stage.active ? "text-blue-600"
                : "text-muted-foreground/50",
              ].join(" ")}>
                {stage.label}
              </span>
            </div>
            {i < stages.length - 1 && (
              <div className="flex-1 mt-[9px] relative" style={{ height: 2 }}>
                <div className="absolute inset-0 bg-border rounded-full" />
                {stage.done && (
                  <div
                    className="absolute inset-0 rounded-full transition-all duration-500"
                    style={{
                      background: stages[i + 1].done
                        ? "#10b981"
                        : stages[i + 1].active
                        ? "linear-gradient(90deg, #10b981 60%, #3b82f6)"
                        : "#10b981",
                    }}
                  />
                )}
              </div>
            )}
          </Fragment>
        ))}
      </div>
      {etaBadge && (
        <div className="flex items-center gap-1 mt-1.5">
          <Clock size={9} className="text-blue-500 flex-shrink-0" />
          <span className="text-[10px] text-blue-600">{etaBadge}</span>
        </div>
      )}
    </div>
  )
}
