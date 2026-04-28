import { useState } from "react"
import { X, CheckCircle, XCircle, Download, Edit3, Save, ChevronDown, FileText } from "lucide-react"
import { api } from "@/core/api"
import { useGet } from "@/core/hooks/useApi"
import { ConfidenceBar } from "@/components/ui/ConfidenceBar"
import InvoiceVisualValidator from "./InvoiceVisualValidator"

const STATUS_LABELS = {
  extracted:      "Extracted",
  pending_review: "Review",
  verified:       "Verified",
  exported:       "Exported",
  rejected:       "Rejected",
}

const STATUS_COLORS = {
  extracted:      "bg-gray-100 text-gray-600 border-gray-200",
  pending_review: "bg-amber-50 text-amber-700 border-amber-200",
  verified:       "bg-blue-50 text-blue-700 border-blue-200",
  exported:       "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected:       "bg-red-50 text-red-700 border-red-200",
}

const VAT_CATEGORIES  = ["ÁFA 27%", "ÁFA 5%", "ÁFA 18%", "ÁFA-mentes", "AAM", "TAM"]
const PAYMENT_METHODS = ["transfer", "cash", "card"]

function fmt(n, cur = "HUF") {
  if (n == null) return "—"
  return Number(n).toLocaleString("hu-HU") + " " + cur
}

function fmtDate(d) {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("hu-HU")
}

export default function InvoiceDetail({ invoiceId, onClose, onUpdated }) {
  const [activeTab, setActiveTab]       = useState("details")
  const [editing, setEditing]           = useState(false)
  const [fields, setFields]             = useState({})
  const [saving, setSaving]             = useState(false)
  const [actionLoad, setActionLoad]     = useState("")
  const [rejectReason, setRejectReason] = useState("")
  const [showReject, setShowReject]     = useState(false)
  const [showExport, setShowExport]     = useState(false)
  const [error, setError]               = useState("")

  const { data: resp, isLoading, refetch } = useGet(
    ["invoice-detail", invoiceId],
    `/invoice/${invoiceId}`,
  )
  const invoice = resp?.data

  function startEdit() {
    if (!invoice) return
    setFields({
      invoice_number: invoice.invoice_number || "",
      vendor_name:    invoice.vendor_name    || "",
      vendor_tax_id:  invoice.vendor_tax_id  || "",
      buyer_name:     invoice.buyer_name     || "",
      amount_net:     invoice.amount_net     ?? "",
      amount_vat:     invoice.amount_vat     ?? "",
      amount_gross:   invoice.amount_gross   ?? "",
      currency:       invoice.currency       || "HUF",
      vat_category:   invoice.vat_category   || "",
      payment_method: invoice.payment_method || "",
      issue_date:     invoice.issue_date?.slice(0, 10) || "",
      due_date:       invoice.due_date?.slice(0, 10)   || "",
      notes:          invoice.notes          || "",
    })
    setEditing(true)
  }

  async function saveEdit() {
    setSaving(true)
    setError("")
    try {
      const body = {}
      for (const [k, v] of Object.entries(fields)) {
        if (v !== "" && v !== null) body[k] = v
      }
      await api.put(`/invoice/${invoiceId}`, body)
      setEditing(false)
      refetch()
      onUpdated?.()
    } catch (err) {
      setError(err.response?.data?.detail || "Save failed")
    } finally {
      setSaving(false)
    }
  }

  async function handleVerify() {
    setActionLoad("verify")
    setError("")
    try {
      await api.post(`/invoice/${invoiceId}/verify`, { note: "" })
      refetch()
      onUpdated?.()
    } catch (err) {
      setError(err.response?.data?.detail || "Verification failed")
    } finally {
      setActionLoad("")
    }
  }

  async function handleReject() {
    if (!rejectReason.trim()) return
    setActionLoad("reject")
    setError("")
    try {
      await api.post(`/invoice/${invoiceId}/reject`, { reason: rejectReason })
      setShowReject(false)
      refetch()
      onUpdated?.()
    } catch (err) {
      setError(err.response?.data?.detail || "Rejection failed")
    } finally {
      setActionLoad("")
    }
  }

  async function handleExport(system) {
    setActionLoad("export")
    setShowExport(false)
    setError("")
    try {
      await api.post(`/invoice/${invoiceId}/export`, { system })
      refetch()
      onUpdated?.()
    } catch (err) {
      setError(err.response?.data?.detail || "Export failed")
    } finally {
      setActionLoad("")
    }
  }

  const canEdit   = invoice && ["extracted", "pending_review"].includes(invoice.status)
  const canVerify = invoice && ["extracted", "pending_review"].includes(invoice.status)
  const canExport = invoice && invoice.status === "verified"

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm">
      <div className={[
        "bg-card border border-border rounded-t-2xl sm:rounded-2xl w-full max-h-[92vh] flex flex-col shadow-2xl transition-all duration-200",
        activeTab === "document" ? "max-w-6xl" : "max-w-[900px]",
      ].join(" ")}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-[15px] font-semibold text-foreground">
              {invoice?.invoice_number || "Invoice Details"}
            </h2>
            {invoice && (
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLORS[invoice.status] ?? ""}`}>
                {STATUS_LABELS[invoice.status] ?? invoice.status}
              </span>
            )}
            {invoice?.source_type === "upload" && (
              <div className="flex gap-0.5 p-0.5 bg-muted rounded-lg border border-border">
                <button
                  onClick={() => setActiveTab("details")}
                  className={[
                    "h-6 px-2.5 text-[11px] font-medium rounded-md transition-all",
                    activeTab === "details" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  ].join(" ")}
                >
                  Invoice Data
                </button>
                <button
                  onClick={() => setActiveTab("document")}
                  className={[
                    "h-6 px-2.5 text-[11px] font-medium rounded-md transition-all flex items-center gap-1",
                    activeTab === "document" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  ].join(" ")}
                >
                  <FileText size={10} /> Original Document
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {canEdit && !editing && activeTab === "details" && (
              <button
                onClick={startEdit}
                className="flex items-center gap-1.5 h-8 px-3 text-[12px] font-medium border border-border rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
              >
                <Edit3 size={12} /> Edit
              </button>
            )}
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
          {isLoading ? (
            <div className="p-10 text-center text-[13px] text-muted-foreground">Loading…</div>
          ) : !invoice ? (
            <div className="p-10 text-center text-[13px] text-red-500">Invoice not found</div>
          ) : activeTab === "document" ? (
            <InvoiceVisualValidator
              invoice={invoice}
              onSave={() => { refetch(); onUpdated?.(); setActiveTab("details") }}
              onClose={() => setActiveTab("details")}
            />
          ) : (
            <div className="flex flex-col lg:flex-row min-h-0">

              {/* Left — Fields */}
              <div className="flex-1 p-6 space-y-5 lg:border-r border-border">
                <SectionTitle>Invoice Details</SectionTitle>
                <div className="grid grid-cols-2 gap-3">
                  <FieldRow label="Invoice #"      field="invoice_number" invoice={invoice} editing={editing} fields={fields} setFields={setFields} />
                  <FieldRow label="Currency"       field="currency"       invoice={invoice} editing={editing} fields={fields} setFields={setFields} />
                  <FieldRow label="Issue Date"     field="issue_date"     invoice={invoice} editing={editing} fields={fields} setFields={setFields} type="date" />
                  <FieldRow label="Due Date"       field="due_date"       invoice={invoice} editing={editing} fields={fields} setFields={setFields} type="date" />
                  <FieldRow label="Payment"        field="payment_method" invoice={invoice} editing={editing} fields={fields} setFields={setFields}
                    asSelect options={PAYMENT_METHODS} />
                </div>

                <SectionTitle>Partners</SectionTitle>
                <div className="grid grid-cols-2 gap-3">
                  <FieldRow label="Vendor Name" field="vendor_name"   invoice={invoice} editing={editing} fields={fields} setFields={setFields} />
                  <FieldRow label="Tax ID"      field="vendor_tax_id" invoice={invoice} editing={editing} fields={fields} setFields={setFields} />
                  <FieldRow label="Buyer Name"  field="buyer_name"    invoice={invoice} editing={editing} fields={fields} setFields={setFields} span={2} />
                </div>

                <SectionTitle>Amounts</SectionTitle>
                <div className="grid grid-cols-3 gap-3">
                  <FieldRow label="Net"          field="amount_net"   invoice={invoice} editing={editing} fields={fields} setFields={setFields} type="number" />
                  <FieldRow label="VAT"          field="amount_vat"   invoice={invoice} editing={editing} fields={fields} setFields={setFields} type="number" />
                  <FieldRow label="Gross"        field="amount_gross" invoice={invoice} editing={editing} fields={fields} setFields={setFields} type="number" />
                  <FieldRow label="VAT Category" field="vat_category" invoice={invoice} editing={editing} fields={fields} setFields={setFields}
                    asSelect options={VAT_CATEGORIES} span={2} />
                </div>

                {(editing || invoice.notes) && (
                  <>
                    <SectionTitle>Notes</SectionTitle>
                    <FieldRow label="Note" field="notes" invoice={invoice} editing={editing} fields={fields} setFields={setFields} asTextarea />
                  </>
                )}

                {editing && (
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => setEditing(false)}
                      className="h-9 px-4 text-[13px] font-medium border border-border rounded-lg text-muted-foreground hover:bg-muted transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveEdit}
                      disabled={saving}
                      className="flex items-center gap-1.5 h-9 px-5 text-[13px] font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
                    >
                      <Save size={13} />
                      {saving ? "Saving…" : "Save"}
                    </button>
                  </div>
                )}
              </div>

              {/* Right — Metadata + Actions */}
              <div className="w-full lg:w-[260px] flex-shrink-0 p-6 space-y-5">

                <div>
                  <SectionTitle>AI Confidence</SectionTitle>
                  <div className="mt-2">
                    <ConfidenceBar value={invoice.confidence} />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Model: {invoice.extraction_model || "gpt-4o-mini"}
                    </p>
                  </div>
                </div>

                <div>
                  <SectionTitle>Timestamps</SectionTitle>
                  <div className="mt-2 space-y-1.5 text-[12px]">
                    <MetaRow label="Created"   value={fmtDate(invoice.created_at)}  />
                    {invoice.verified_at && <MetaRow label="Verified at"  value={fmtDate(invoice.verified_at)} />}
                    {invoice.exported_at && <MetaRow label="Exported at"  value={fmtDate(invoice.exported_at)} />}
                    {invoice.export_system && <MetaRow label="System"     value={invoice.export_system} />}
                    {invoice.export_id && <MetaRow label="Export ID"      value={invoice.export_id} />}
                  </div>
                </div>

                {invoice.rejection_reason && (
                  <div>
                    <SectionTitle>Rejection Reason</SectionTitle>
                    <p className="text-[12px] text-red-600 mt-1">{invoice.rejection_reason}</p>
                  </div>
                )}

                {error && (
                  <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-[12px] text-red-700">
                    {error}
                  </div>
                )}

                {/* Actions */}
                <div className="space-y-2">
                  <SectionTitle>Actions</SectionTitle>

                  {canVerify && (
                    <button
                      onClick={handleVerify}
                      disabled={actionLoad === "verify"}
                      className="w-full flex items-center justify-center gap-2 h-9 bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-medium rounded-lg transition-colors disabled:opacity-50"
                    >
                      <CheckCircle size={14} />
                      {actionLoad === "verify" ? "Verifying…" : "Verify"}
                    </button>
                  )}

                  {canVerify && !showReject && (
                    <button
                      onClick={() => setShowReject(true)}
                      className="w-full flex items-center justify-center gap-2 h-9 border border-red-200 text-red-600 hover:bg-red-50 text-[13px] font-medium rounded-lg transition-colors"
                    >
                      <XCircle size={14} />
                      Reject
                    </button>
                  )}

                  {showReject && (
                    <div className="space-y-2">
                      <textarea
                        value={rejectReason}
                        onChange={e => setRejectReason(e.target.value)}
                        placeholder="Reason for rejection…"
                        rows={3}
                        className="w-full px-2.5 py-2 text-[12px] border border-border rounded-lg bg-muted/30 focus:outline-none focus:border-red-400 resize-none"
                      />
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => setShowReject(false)}
                          className="flex-1 h-8 text-[12px] border border-border rounded-lg text-muted-foreground hover:bg-muted"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleReject}
                          disabled={!rejectReason.trim() || actionLoad === "reject"}
                          className="flex-1 h-8 text-[12px] bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50"
                        >
                          {actionLoad === "reject" ? "…" : "Reject"}
                        </button>
                      </div>
                    </div>
                  )}

                  {canExport && (
                    <div className="relative">
                      <button
                        onClick={() => setShowExport(v => !v)}
                        disabled={actionLoad === "export"}
                        className="w-full flex items-center justify-center gap-2 h-9 bg-emerald-600 hover:bg-emerald-700 text-white text-[13px] font-medium rounded-lg transition-colors disabled:opacity-50"
                      >
                        <Download size={14} />
                        {actionLoad === "export" ? "Exporting…" : "Export"}
                        <ChevronDown size={13} className={showExport ? "rotate-180 transition-transform" : "transition-transform"} />
                      </button>
                      {showExport && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-lg overflow-hidden z-10">
                          {[
                            { id: "billingo",  label: "Billingo"     },
                            { id: "szamlazz",  label: "Számlázz.hu" },
                            { id: "manual",    label: "Manual"       },
                          ].map(opt => (
                            <button
                              key={opt.id}
                              onClick={() => handleExport(opt.id)}
                              className="w-full text-left px-4 py-2.5 text-[13px] hover:bg-muted transition-colors"
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────

function SectionTitle({ children }) {
  return <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">{children}</h3>
}

function MetaRow({ label, value }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground font-medium">{value}</span>
    </div>
  )
}

function FieldRow({ label, field, invoice, editing, fields, setFields, type = "text", asSelect, asTextarea, options = [], span }) {
  const display  = invoice[field]
  const colSpan  = span === 2 ? "col-span-2" : ""

  if (!editing) {
    return (
      <div className={colSpan}>
        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">{label}</div>
        <div className="text-[13px] text-foreground">{
          type === "number" && display != null
            ? Number(display).toLocaleString("hu-HU")
            : display || "—"
        }</div>
      </div>
    )
  }

  const inputClass = "w-full h-8 px-2.5 text-[13px] border border-border bg-muted/30 rounded-lg text-foreground focus:outline-none focus:border-blue-400 transition-colors"

  return (
    <div className={colSpan}>
      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{label}</div>
      {asTextarea ? (
        <textarea
          rows={3}
          value={fields[field] ?? ""}
          onChange={e => setFields(f => ({ ...f, [field]: e.target.value }))}
          className={inputClass + " h-auto py-2 resize-none"}
        />
      ) : asSelect ? (
        <select
          value={fields[field] ?? ""}
          onChange={e => setFields(f => ({ ...f, [field]: e.target.value }))}
          className={inputClass + " cursor-pointer"}
        >
          <option value="">—</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input
          type={type}
          value={fields[field] ?? ""}
          onChange={e => setFields(f => ({ ...f, [field]: e.target.value }))}
          className={inputClass}
        />
      )}
    </div>
  )
}
