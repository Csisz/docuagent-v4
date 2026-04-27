import { useState, useRef } from "react"
import { X, Sparkles, FileUp, AlertTriangle, FileText, X as XIcon } from "lucide-react"
import { api } from "@/core/api"

const ACCEPTED  = ".pdf,.jpg,.jpeg,.png,.webp,.docx"
const MAX_BYTES = 10 * 1024 * 1024

function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function InvoiceExtractModal({ onClose, onSuccess }) {
  const [tab, setTab]           = useState("text")
  const [text, setText]         = useState("")
  const [file, setFile]         = useState(null)
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState("")
  const fileInputRef = useRef(null)

  // ── Text extraction ──────────────────────────────────────────
  async function handleExtract() {
    if (!text.trim() || text.length < 10) return
    setLoading(true); setError("")
    try {
      await api.post("/invoice/extract", { text: text.trim(), source_type: "manual" })
      onSuccess?.()
    } catch (err) {
      setError(err.response?.data?.detail || "Kinyerés sikertelen. Kérjük próbálja újra.")
      setLoading(false)
    }
  }

  // ── File upload ──────────────────────────────────────────────
  async function handleUpload() {
    if (!file) return
    setLoading(true); setError("")
    const token = localStorage.getItem("access_token")
    const form  = new FormData()
    form.append("file", file)
    try {
      const res  = await fetch("/invoice/upload", {
        method:  "POST",
        headers: { Authorization: `Bearer ${token}` },
        body:    form,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.detail || `HTTP ${res.status}`)
      onSuccess?.()
    } catch (err) {
      setError(err.message || "Feltöltés sikertelen. Kérjük próbálja újra.")
      setLoading(false)
    }
  }

  // ── File helpers ─────────────────────────────────────────────
  function pickFile(f) {
    if (!f) return
    if (f.size > MAX_BYTES) { setError("A fájl mérete meghaladja a 10 MB-os határt."); return }
    setFile(f); setError("")
  }
  function onDrop(e) {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) pickFile(f)
  }

  // ── Extraction form ──────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl w-full max-w-[640px] shadow-xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-blue-500" />
            <h2 className="text-[15px] font-semibold text-foreground">Számla feldolgozása</h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
          >
            <X size={15} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Tabs */}
          <div className="flex gap-1 p-1 bg-muted/50 rounded-xl border border-border">
            <TabBtn active={tab === "text"} onClick={() => { setTab("text"); setError("") }}>
              <FileText size={13} />
              Szöveg beillesztése
            </TabBtn>
            <TabBtn active={tab === "file"} onClick={() => { setTab("file"); setError("") }}>
              <FileUp size={13} />
              Fájl feltöltése
            </TabBtn>
          </div>

          {/* Tab: Text */}
          {tab === "text" && (
            <div className="space-y-4">
              <div>
                <label className="block text-[12px] font-medium text-muted-foreground mb-1.5">
                  Számla szövege
                </label>
                <textarea
                  value={text}
                  onChange={e => setText(e.target.value)}
                  placeholder="Illessze be a számla szövegét vagy email tartalmát ide..."
                  rows={10}
                  className="w-full px-3 py-2.5 text-[13px] bg-muted/30 border border-border rounded-xl text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-blue-400 resize-none transition-colors font-mono"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  {text.length} karakter — minimum 10 karakter szükséges
                </p>
              </div>

              {error && <ErrorBanner>{error}</ErrorBanner>}

              <div className="flex justify-end gap-2">
                <button onClick={onClose} className="h-9 px-4 text-[13px] font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-muted transition-all">
                  Mégse
                </button>
                <button
                  onClick={handleExtract}
                  disabled={loading || text.length < 10}
                  className="flex items-center gap-2 h-9 px-5 text-[13px] font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? <Spinner /> : <Sparkles size={14} />}
                  {loading ? "Feldolgozás..." : "Kinyerés"}
                </button>
              </div>
            </div>
          )}

          {/* Tab: File */}
          {tab === "file" && (
            <div className="space-y-4">
              {!file ? (
                <div
                  onDragOver={e => { e.preventDefault(); setDragging(true) }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={[
                    "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 cursor-pointer transition-all duration-150",
                    dragging
                      ? "border-blue-400 bg-blue-50/30"
                      : "border-border hover:border-blue-300 hover:bg-muted/30",
                  ].join(" ")}
                >
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center">
                    <FileUp size={22} className="text-blue-500" />
                  </div>
                  <div className="text-center">
                    <p className="text-[13px] font-medium text-foreground">Húzza ide a fájlt, vagy kattintson a tallózáshoz</p>
                    <p className="text-[11px] text-muted-foreground mt-1">PDF, JPG, PNG, WEBP, DOCX — max. 10 MB</p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPTED}
                    className="hidden"
                    onChange={e => pickFile(e.target.files?.[0])}
                  />
                </div>
              ) : (
                <div className="flex items-center gap-3 p-4 bg-muted/40 border border-border rounded-xl">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center flex-shrink-0">
                    <FileText size={16} className="text-blue-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-foreground truncate">{file.name}</p>
                    <p className="text-[11px] text-muted-foreground">{fmtSize(file.size)}</p>
                  </div>
                  <button
                    onClick={() => { setFile(null); setError("") }}
                    className="w-6 h-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                  >
                    <XIcon size={13} />
                  </button>
                </div>
              )}

              {error && <ErrorBanner>{error}</ErrorBanner>}

              <div className="flex justify-end gap-2">
                <button onClick={onClose} className="h-9 px-4 text-[13px] font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-muted transition-all">
                  Mégse
                </button>
                <button
                  onClick={handleUpload}
                  disabled={loading || !file}
                  className="flex items-center gap-2 h-9 px-5 text-[13px] font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? <Spinner /> : <FileUp size={14} />}
                  {loading ? "Feldolgozás..." : "Feltöltés és kinyerés"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function TabBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={[
        "flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg text-[12px] font-medium transition-all duration-150",
        active
          ? "bg-card border border-border text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      ].join(" ")}
    >
      {children}
    </button>
  )
}

function ErrorBanner({ children }) {
  return (
    <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
      <AlertTriangle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
      <p className="text-[12px] text-red-700">{children}</p>
    </div>
  )
}

function Spinner() {
  return <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
}
