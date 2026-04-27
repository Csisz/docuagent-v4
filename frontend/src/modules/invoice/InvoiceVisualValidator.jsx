import { useState, useEffect, useRef } from "react"
import { Save, Loader2, X, ExternalLink, ChevronDown } from "lucide-react"

// ── Constants ────────────────────────────────────────────────────

const FIELD_ORDER = [
  "invoice_number", "vendor_name", "vendor_tax_id", "buyer_name",
  "amount_net", "amount_vat", "amount_gross", "vat_rate", "vat_category",
  "issue_date", "due_date", "payment_method",
]

const FIELD_LABELS = {
  invoice_number:  "Számlaszám",
  vendor_name:     "Kibocsátó neve",
  vendor_tax_id:   "Adószám",
  buyer_name:      "Vevő neve",
  amount_net:      "Nettó összeg",
  amount_vat:      "ÁFA összeg",
  amount_gross:    "Bruttó összeg",
  vat_rate:        "ÁFA kulcs",
  vat_category:    "ÁFA kategória",
  issue_date:      "Kiállítás dátuma",
  due_date:        "Fizetési határidő",
  payment_method:  "Fizetési mód",
}

const NUMERIC_FIELDS = new Set(["amount_net", "amount_vat", "amount_gross", "vat_rate"])
const DATE_FIELDS    = new Set(["issue_date", "due_date"])

// ── Pure helpers ─────────────────────────────────────────────────

function toDisplayString(v) {
  if (v == null) return ""
  if (Array.isArray(v)) return v.map(x => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(", ")
  if (typeof v === "object") return JSON.stringify(v)
  return String(v)
}

function sanitizeFields(fields) {
  const cleaned = {}
  for (const [key, val] of Object.entries(fields)) {
    if (val === null || val === undefined || val === "") {
      cleaned[key] = null
    } else if (Array.isArray(val)) {
      cleaned[key] = val.map(v => (typeof v === "object" ? JSON.stringify(v) : String(v))).join(", ")
    } else if (typeof val === "object") {
      cleaned[key] = String(val)
    } else if (NUMERIC_FIELDS.has(key)) {
      const num = parseFloat(String(val).replace(/[^0-9.-]/g, ""))
      cleaned[key] = isNaN(num) ? null : num
    } else if (DATE_FIELDS.has(key)) {
      const d = new Date(val)
      if (!isNaN(d.getTime())) {
        cleaned[key] = d.toISOString().split("T")[0]
      } else {
        cleaned[key] = String(val).slice(0, 10) || null
      }
    } else {
      cleaned[key] = String(val)
    }
  }
  return cleaned
}

function confidenceMeta(conf) {
  const pct = Math.round((conf ?? 0) * 100)
  if (pct >= 85) return { label: `Magas pontosság (${pct}%)`,   bg: "#f0fdf4", border: "#bbf7d0", color: "#15803d" }
  if (pct >= 65) return { label: `Közepes pontosság (${pct}%)`, bg: "#fffbeb", border: "#fde68a", color: "#b45309",
    sub: "Javasolt: ellenőrizze a kiemelt mezőket" }
  return { label: `Alacsony pontosság (${pct}%)`, bg: "#fef2f2", border: "#fecaca", color: "#b91c1c",
    sub: "Javasolt: ellenőrizze az összes mezőt" }
}

// ── Client-side VAT math validation (mirrors backend validate_invoice_math) ──

function clientValidate(fields) {
  const issues = []
  const net      = parseFloat(fields.amount_net)  || null
  const vat      = parseFloat(fields.amount_vat)  || null
  const gross    = parseFloat(fields.amount_gross) || null
  const vatRate  = parseFloat(fields.vat_rate)    || null

  if (!net && !vat && !gross) return issues

  const TOLERANCE = 0.02

  if (net && vat && gross) {
    const expectedGross = Math.round((net + vat) * 100) / 100
    if (Math.abs(expectedGross - gross) > TOLERANCE) {
      issues.push({
        field:    "amount_gross",
        severity: "error",
        message:  `Bruttó összeg nem egyezik: ${net} + ${vat} = ${expectedGross}, de ${gross} van megadva`,
        expected: expectedGross,
        actual:   gross,
      })
    }
  }

  if (net && vatRate && vat) {
    const expectedVat = Math.round(net * vatRate * 100) / 100
    if (Math.abs(expectedVat - vat) > Math.max(TOLERANCE, net * 0.005)) {
      issues.push({
        field:    "amount_vat",
        severity: "error",
        message:  `ÁFA összeg nem stimmel: ${net} × ${(vatRate * 100).toFixed(0)}% = ${expectedVat}, de ${vat} van megadva`,
        expected: expectedVat,
        actual:   vat,
      })
    }
  }

  const VALID_RATES = [0.0, 0.05, 0.18, 0.27]
  if (vatRate !== null && !VALID_RATES.includes(vatRate)) {
    issues.push({
      field:    "vat_rate",
      severity: "warning",
      message:  `Szokatlan ÁFA kulcs: ${(vatRate * 100).toFixed(1)}%. Magyar ÁFA kulcsok: 0%, 5%, 18%, 27%`,
      expected: null,
      actual:   vatRate,
    })
  }

  for (const [field, val] of [["amount_net", net], ["amount_vat", vat], ["amount_gross", gross]]) {
    if (val !== null && val < 0) {
      issues.push({
        field,
        severity: "warning",
        message:  `Negatív összeg: ${val}. Jóváírási számla?`,
        expected: null,
        actual:   val,
      })
    }
  }

  return issues
}

// ── Due date badge ───────────────────────────────────────────────

function DueDateBadge({ dueDate }) {
  if (!dueDate) return null
  const today = new Date()
  const due   = new Date(dueDate)
  const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: "#fee2e2", color: "#dc2626", marginTop: 4 }}>
        ⚠ Lejárt {Math.abs(diffDays)} napja
      </span>
    )
  }
  if (diffDays <= 3) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: "#fef3c7", color: "#d97706", marginTop: 4 }}>
        ⏰ {diffDays} nap múlva esedékes
      </span>
    )
  }
  if (diffDays <= 7) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: "#fef9c3", color: "#ca8a04", marginTop: 4 }}>
        📅 {diffDays} nap ({dueDate})
      </span>
    )
  }
  return null
}

// ── Component ────────────────────────────────────────────────────

export default function InvoiceVisualValidator({ invoice, onSave, onClose }) {
  const [imageLoaded,        setImageLoaded]        = useState(false)
  const [imageError,         setImageError]          = useState(false)
  const [fields,             setFields]              = useState({})
  const [saving,             setSaving]              = useState(false)
  const [saveError,          setSaveError]           = useState("")
  const [duplicateInfo,      setDuplicateInfo]       = useState(null)
  const [dismissedDuplicate, setDismissedDuplicate]  = useState(false)
  const [exportOpen,         setExportOpen]          = useState(false)
  const [exporting,          setExporting]           = useState(false)
  const [exportResult,       setExportResult]        = useState(null)  // { billingo_url, billingo_id, message }
  const [exportError,        setExportError]         = useState("")
  const exportRef = useRef(null)

  // Reset on invoice change
  useEffect(() => {
    setImageLoaded(false)
    setImageError(false)
    setDuplicateInfo(null)
    setDismissedDuplicate(false)
    setExportOpen(false)
    setExporting(false)
    setExportError("")
    // Pre-fill exportResult if invoice is already exported to Billingo
    if (invoice?.status === "exported" && invoice?.export_system === "billingo" && invoice?.export_url) {
      setExportResult({ billingo_url: invoice.export_url, billingo_id: invoice.export_id, message: "Exportálva Billingoba" })
    } else {
      setExportResult(null)
    }
  }, [invoice?.id])

  // Close export dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (exportRef.current && !exportRef.current.contains(e.target)) setExportOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  // Init fields from invoice data
  useEffect(() => {
    if (!invoice) return
    const init = {}
    FIELD_ORDER.forEach(key => { init[key] = toDisplayString(invoice[key]) })
    setFields(init)
  }, [invoice?.id])

  // Check for duplicate on load
  useEffect(() => {
    if (!invoice?.id) return
    const token = localStorage.getItem("access_token")
    fetch(`/invoice/${invoice.id}/check-duplicate`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (json?.data?.is_duplicate) setDuplicateInfo(json.data.duplicate_invoice)
      })
      .catch(() => {})
  }, [invoice?.id])

  // Compute validation issues client-side (re-runs on every field change)
  const validationIssues = clientValidate(fields)

  // Helper: get field-level error/warning
  const fieldIssue = (key) => validationIssues.find(i => i.field === key)

  // ── Save ──────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true)
    setSaveError("")
    try {
      const token = localStorage.getItem("access_token")
      const res   = await fetch(`/invoice/${invoice.id}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify(sanitizeFields(fields)),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.detail || `HTTP ${res.status}`)
      }
      onSave?.(fields)
    } catch (err) {
      setSaveError(err.message || "Mentés sikertelen")
      setSaving(false)
    }
  }

  // ── Export ────────────────────────────────────────────────────
  async function handleExport(system) {
    setExporting(true)
    setExportOpen(false)
    setExportError("")
    try {
      const token = localStorage.getItem("access_token")
      const res   = await fetch(`/invoice/${invoice.id}/export`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ system }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.detail || `HTTP ${res.status}`)
      setExportResult(json?.data ?? json)
    } catch (err) {
      setExportError(err.message || "Export sikertelen")
    } finally {
      setExporting(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────
  const conf     = confidenceMeta(invoice?.confidence)
  const hasFile  = invoice?.source_type === "upload" && invoice?.source_id
  const token    = localStorage.getItem("access_token") || ""
  const imageUrl = hasFile ? `/invoice/preview-png/${invoice.id}?token=${encodeURIComponent(token)}` : null

  return (
    <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>

      {/* ── Left: Document viewer ───────────────────────────── */}
      <div style={{ flex: "0 0 60%", display: "flex", flexDirection: "column", borderRight: "1px solid #e2e8f0", overflow: "hidden" }}>

        {/* Viewer header */}
        <div style={{ display: "flex", alignItems: "center", padding: "8px 16px", borderBottom: "1px solid #e2e8f0", backgroundColor: "#f8fafc", flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: "#64748b", fontWeight: 500 }}>
            {invoice?.filename || "Számla előnézet"}
          </span>
        </div>

        {/* Document area */}
        <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", backgroundColor: "#f1f5f9" }}>
          {!imageUrl ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 200, color: "#94a3b8", gap: 8 }}>
              <span style={{ fontSize: 32 }}>📄</span>
              <span style={{ fontSize: 13 }}>Előnézet nem elérhető</span>
            </div>
          ) : (
            <div style={{ padding: 12 }}>
              <div style={{
                position: "relative", display: "inline-block", width: "100%",
                border: "2px solid transparent", borderRadius: 8, overflow: "hidden",
                boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                minHeight: imageLoaded ? "auto" : 400,
                backgroundColor: "#e2e8f0",
              }}>
                {!imageLoaded && !imageError && (
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8, color: "#94a3b8" }}>
                    <Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} />
                    <span style={{ fontSize: 12 }}>Kép betöltése...</span>
                  </div>
                )}
                {imageError && (
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8, color: "#94a3b8" }}>
                    <span style={{ fontSize: 28 }}>📄</span>
                    <span style={{ fontSize: 12 }}>Előnézet nem elérhető</span>
                  </div>
                )}
                <img
                  src={imageUrl}
                  alt="Számla"
                  draggable={false}
                  style={{ display: imageLoaded ? "block" : "none", width: "100%", userSelect: "none" }}
                  onLoad={() => setImageLoaded(true)}
                  onError={() => setImageError(true)}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div style={{ padding: "6px 16px", borderTop: "1px solid #e2e8f0", backgroundColor: "#f8fafc", flexShrink: 0 }}>
          <p style={{ fontSize: 10, color: "#94a3b8", margin: 0 }}>
            Szerkessze a mezőket és mentse a számlát
          </p>
        </div>
      </div>

      {/* ── Right: Field editor ──────────────────────────────── */}
      <div style={{ flex: "0 0 40%", display: "flex", flexDirection: "column", overflow: "hidden", backgroundColor: "#fff" }}>

        {/* Duplicate warning banner */}
        {duplicateInfo && !dismissedDuplicate && (
          <div style={{ padding: "10px 16px", backgroundColor: "#fffbeb", borderBottom: "1px solid #fde68a", flexShrink: 0, display: "flex", alignItems: "flex-start", gap: 10 }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>⚠</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#92400e" }}>Lehetséges duplikált számla</div>
              <div style={{ fontSize: 11, color: "#78350f", marginTop: 2 }}>
                Ugyanezzel a számlaszámmal már létezik egy számla:{" "}
                <strong>{duplicateInfo.vendor_name}</strong> #{duplicateInfo.invoice_number}
                {duplicateInfo.created_at && ` (${new Date(duplicateInfo.created_at).toLocaleDateString("hu-HU")})`}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <button
                  onClick={() => window.open(`/invoice/${duplicateInfo.id}`, "_blank")}
                  style={{ fontSize: 11, fontWeight: 600, color: "#92400e", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 6, padding: "3px 10px", cursor: "pointer" }}
                >
                  Megtekintés
                </button>
                <button
                  onClick={() => setDismissedDuplicate(true)}
                  style={{ fontSize: 11, color: "#78350f", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
                >
                  Figyelmen kívül hagyom
                </button>
              </div>
            </div>
            <button onClick={() => setDismissedDuplicate(true)} style={{ background: "none", border: "none", cursor: "pointer", color: "#92400e", flexShrink: 0, padding: 2 }}>
              <X size={14} />
            </button>
          </div>
        )}

        {/* Confidence badge */}
        <div style={{ padding: "10px 16px", backgroundColor: conf.bg, borderBottom: `1px solid ${conf.border}`, flexShrink: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: conf.color }}>✦ {conf.label}</div>
          {conf.sub && <div style={{ fontSize: 11, color: conf.color, marginTop: 2, opacity: 0.85 }}>{conf.sub}</div>}
        </div>

        {/* Validation issues panel */}
        {validationIssues.length > 0 && (
          <div style={{ padding: "10px 16px", borderBottom: "1px solid #e2e8f0", flexShrink: 0 }}>
            {validationIssues.map((issue, i) => (
              <div key={i} style={{
                display: "flex", gap: 8, alignItems: "flex-start",
                padding: "8px 12px", marginBottom: 4, borderRadius: 8,
                background: issue.severity === "error" ? "#fef2f2" : "#fffbeb",
                border: `1px solid ${issue.severity === "error" ? "#fecaca" : "#fde68a"}`,
              }}>
                <span style={{ fontSize: 13, flexShrink: 0, color: issue.severity === "error" ? "#dc2626" : "#d97706" }}>
                  {issue.severity === "error" ? "✖" : "⚠"}
                </span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: issue.severity === "error" ? "#dc2626" : "#d97706" }}>
                    {issue.message}
                  </div>
                  {issue.expected != null && (
                    <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                      Várt érték: {issue.expected}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Field list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
          {FIELD_ORDER.map(key => {
            const issue = fieldIssue(key)
            const hasError   = issue?.severity === "error"
            const hasWarning = issue?.severity === "warning"
            return (
              <div
                key={key}
                style={{
                  border: `1px solid ${hasError ? "#fecaca" : hasWarning ? "#fde68a" : "#e2e8f0"}`,
                  borderRadius: 8,
                  padding: "8px 12px", marginBottom: 6,
                  backgroundColor: hasError ? "#fef2f2" : hasWarning ? "#fffbeb" : "#fff",
                }}
              >
                <div style={{ fontSize: 10, fontWeight: 700, color: hasError ? "#dc2626" : hasWarning ? "#d97706" : "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>
                  {FIELD_LABELS[key]}
                </div>
                <input
                  value={fields[key] ?? ""}
                  onChange={e => setFields(prev => ({ ...prev, [key]: e.target.value }))}
                  placeholder="—"
                  style={{ width: "100%", border: "none", outline: "none", fontSize: 13, color: "#111827", backgroundColor: "transparent", fontFamily: "inherit" }}
                />
                {/* Due date badge inline */}
                {key === "due_date" && fields[key] && (
                  <DueDateBadge dueDate={fields[key]} />
                )}
                {/* Inline field error */}
                {issue && (
                  <div style={{ fontSize: 11, color: issue.severity === "error" ? "#dc2626" : "#d97706", marginTop: 3 }}>
                    {issue.severity === "error" ? "✖" : "⚠"} {issue.message}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Export section (verified invoices only) */}
        {(invoice?.status === "verified" || invoice?.status === "exported") && (
          <div style={{ padding: "10px 16px", borderTop: "1px solid #e2e8f0", flexShrink: 0 }}>
            {exportResult ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8 }}>
                <span style={{ fontSize: 14 }}>✅</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#15803d" }}>
                    {exportResult.message || "Exportálva Billingoba"}
                  </div>
                  {exportResult.billingo_id && (
                    <div style={{ fontSize: 11, color: "#166534", marginTop: 2 }}>
                      Billingo ID: #{exportResult.billingo_id}
                    </div>
                  )}
                </div>
                {exportResult.billingo_url && (
                  <a
                    href={exportResult.billingo_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: "#15803d", textDecoration: "none", padding: "4px 8px", border: "1px solid #bbf7d0", borderRadius: 6, background: "#dcfce7", whiteSpace: "nowrap" }}
                  >
                    Megtekintés Billingóban <ExternalLink size={10} />
                  </a>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, color: "#64748b", fontWeight: 500 }}>Export:</span>
                <div ref={exportRef} style={{ position: "relative" }}>
                  <button
                    onClick={() => setExportOpen(v => !v)}
                    disabled={exporting}
                    style={{ display: "flex", alignItems: "center", gap: 6, height: 30, padding: "0 12px", fontSize: 12, fontWeight: 600, border: "1px solid #e2e8f0", borderRadius: 8, backgroundColor: exporting ? "#f1f5f9" : "#fff", color: "#111827", cursor: exporting ? "not-allowed" : "pointer" }}
                  >
                    {exporting
                      ? <><Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} /> Exportálás...</>
                      : <><span>📤</span> Exportálás <ChevronDown size={11} /></>
                    }
                  </button>
                  {exportOpen && (
                    <div style={{ position: "absolute", bottom: "100%", left: 0, marginBottom: 4, backgroundColor: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, boxShadow: "0 4px 16px rgba(0,0,0,0.1)", minWidth: 200, zIndex: 100, overflow: "hidden" }}>
                      <button
                        onClick={() => handleExport("billingo")}
                        style={{ width: "100%", textAlign: "left", padding: "10px 14px", border: "none", background: "none", cursor: "pointer", borderBottom: "1px solid #f1f5f9" }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = "#f8fafc"}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}
                      >
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>📊 Billingo</div>
                        <div style={{ fontSize: 11, color: "#64748b", marginTop: 1 }}>Export Billingo API-n keresztül</div>
                      </button>
                      <button
                        disabled
                        style={{ width: "100%", textAlign: "left", padding: "10px 14px", border: "none", background: "none", cursor: "not-allowed", opacity: 0.4, borderBottom: "1px solid #f1f5f9" }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>📄 Számlázz.hu</div>
                        <div style={{ fontSize: 11, color: "#64748b", marginTop: 1 }}>Hamarosan elérhető</div>
                      </button>
                      <button
                        onClick={() => handleExport("manual")}
                        style={{ width: "100%", textAlign: "left", padding: "10px 14px", border: "none", background: "none", cursor: "pointer" }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = "#f8fafc"}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}
                      >
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>✓ Manuális</div>
                        <div style={{ fontSize: 11, color: "#64748b", marginTop: 1 }}>Exportáltnak jelöl</div>
                      </button>
                    </div>
                  )}
                </div>
                {exportError && (
                  <span style={{ fontSize: 11, color: "#dc2626" }}>{exportError}</span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Save error */}
        {saveError && (
          <div style={{ margin: "0 16px 8px", padding: "8px 12px", backgroundColor: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontSize: 12, color: "#b91c1c", flexShrink: 0 }}>
            {saveError}
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid #e2e8f0", flexShrink: 0, backgroundColor: "#f8fafc" }}>
          <button
            onClick={onClose}
            style={{ height: 36, padding: "0 16px", fontSize: 13, fontWeight: 500, border: "1px solid #e2e8f0", borderRadius: 8, backgroundColor: "#fff", color: "#64748b", cursor: "pointer" }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = "#f1f5f9"}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = "#fff"}
          >
            Elvetés
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ flex: 1, height: 36, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 13, fontWeight: 600, border: "none", borderRadius: 8, backgroundColor: saving ? "#93c5fd" : "#2563eb", color: "#fff", cursor: saving ? "not-allowed" : "pointer" }}
            onMouseEnter={e => { if (!saving) e.currentTarget.style.backgroundColor = "#1d4ed8" }}
            onMouseLeave={e => { if (!saving) e.currentTarget.style.backgroundColor = "#2563eb" }}
          >
            {saving
              ? <><Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> Mentés...</>
              : <><Save size={13} /> Mentés és bezárás</>
            }
          </button>
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
