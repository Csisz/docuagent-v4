import { useEffect, useRef, useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { useGet } from "@/core/hooks/useApi"
import { api } from "@/core/api"
import { ArrowLeft, CheckCircle, XCircle, RefreshCw, AlertTriangle, Sparkles, BookOpen } from "lucide-react"
import ReplyEditor from "./components/ReplyEditor"
import {
  getApiErrorMessage,
  normalizeEmailResponse,
  normalizeReplyResponse,
  parseAiDecision,
} from "./emailResponse"

// ── Status / category configs ──────────────────────────────────
const STATUS_CFG = {
  new:             { label: "Új",                bg: "bg-blue-50",    text: "text-blue-700",    border: "border-blue-200"    },
  ai_answered:     { label: "AI válasz",         bg: "bg-purple-50",  text: "text-purple-700",  border: "border-purple-200"  },
  needs_attention: { label: "Figyelmet igényel", bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200"   },
  approved:        { label: "Jóváhagyva",        bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  rejected:        { label: "Elutasítva",        bg: "bg-red-50",     text: "text-red-700",     border: "border-red-200"     },
  sent:            { label: "Elküldve",          bg: "bg-teal-50",    text: "text-teal-700",    border: "border-teal-200"    },
  closed:          { label: "Lezárt",            bg: "bg-gray-100",   text: "text-gray-600",    border: "border-gray-200"    },
}

const CAT_CFG = {
  customer_complaint: { label: "Panasz",     bg: "bg-red-50",    text: "text-red-700",    border: "border-red-200"    },
  invoice_payment:    { label: "Számlázás",  bg: "bg-blue-50",   text: "text-blue-700",   border: "border-blue-200"   },
  meeting_request:    { label: "Találkozó",  bg: "bg-violet-50", text: "text-violet-700", border: "border-violet-200" },
  general_inquiry:    { label: "Érdeklődés", bg: "bg-gray-100",  text: "text-gray-600",   border: "border-gray-200"   },
  auto_forward:       { label: "Továbbítás", bg: "bg-gray-100",  text: "text-gray-500",   border: "border-gray-200"   },
  other:              { label: "Egyéb",      bg: "bg-gray-100",  text: "text-gray-500",   border: "border-gray-200"   },
}

const SENTIMENT_CFG = {
  positive: { label: "Pozitív",  color: "text-emerald-600" },
  neutral:  { label: "Semleges", color: "text-gray-500"    },
  negative: { label: "Negatív",  color: "text-red-600"     },
  urgent:   { label: "Sürgős",   color: "text-amber-600"   },
}

// ── Helpers ────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return "—"
  return new Date(d).toLocaleString("hu-HU")
}

function Badge({ cfg, label }) {
  const c = cfg ?? { label: label || "—", bg: "bg-gray-100", text: "text-gray-500", border: "border-gray-200" }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${c.bg} ${c.text} ${c.border}`}>
      {c.label}
    </span>
  )
}

function MetaRow({ label, children }) {
  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-border last:border-0">
      <span className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wider w-28 flex-shrink-0 mt-0.5">
        {label}
      </span>
      <div className="flex-1 text-[13px] text-foreground">{children}</div>
    </div>
  )
}

function ConfRing({ value }) {
  const pct    = Math.round((value ?? 0) * 100)
  const r      = 36
  const circ   = 2 * Math.PI * r
  const color  = pct >= 85 ? "#10b981" : pct >= 65 ? "#f59e0b" : "#ef4444"
  const lvl    = pct >= 85 ? "MAGAS" : pct >= 65 ? "KÖZEPES" : "ALACSONY"
  const lvlCl  = pct >= 85 ? "text-emerald-600" : pct >= 65 ? "text-amber-600" : "text-red-500"

  const [arc, setArc] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => setArc(pct), 80)
    return () => clearTimeout(t)
  }, [pct])

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-20 h-20">
        <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r={r} fill="none" stroke="#e5e7eb" strokeWidth="7" />
          <circle
            cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={`${(arc / 100) * circ} ${circ}`}
            style={{ transition: "stroke-dasharray 1s cubic-bezier(0.4, 0, 0.2, 1)" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[15px] font-bold text-foreground">{pct}%</span>
        </div>
      </div>
      <span className={`text-[10px] font-bold tracking-wider ${lvlCl}`}>{lvl}</span>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────
export default function EmailDetailPage() {
  const { id }       = useParams()
  const navigate     = useNavigate()
  const queryClient  = useQueryClient()

  const [reply, setReply]           = useState(null)  // null = not loaded yet
  const [displayedReply, setDisped] = useState("")
  const [isTyping, setIsTyping]     = useState(false)
  const [actionLoad, setAction]     = useState("")
  const [error, setError]           = useState("")
  const [message, setMessage]       = useState("")
  const timerRef                    = useRef(null)

  const { data: resp, isLoading } = useGet(["email-detail", id], `/email/${id}`)
  const email = normalizeEmailResponse(resp)

  function startTypewriter(text) {
    if (timerRef.current) clearInterval(timerRef.current)
    if (!text) { setDisped(""); setIsTyping(false); return }
    setIsTyping(true)
    setDisped("")
    let i = 0
    timerRef.current = setInterval(() => {
      i++
      setDisped(text.slice(0, i))
      if (i >= text.length) {
        clearInterval(timerRef.current)
        timerRef.current = null
        setIsTyping(false)
      }
    }, 10)
  }

  function skipTypewriter(fullText) {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
    setDisped(fullText)
    setIsTyping(false)
  }

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  useEffect(() => {
    if (reply === null && email) {
      const text = email.ai_response ?? ""
      setReply(text)
      if (text) startTypewriter(text)
      else setDisped("")
    }
  }, [email, reply])

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["email-detail", id] })
    queryClient.invalidateQueries({ queryKey: ["emails-list"] })
    queryClient.invalidateQueries({ queryKey: ["emails-approval-queue"] })
  }

  async function doAction(action) {
    setAction(action)
    setError("")
    setMessage("")
    try {
      if (action === "approve") {
        await api.post(`/email/${id}/approve`, { reply_override: effectiveReply.trim() || undefined })
        setMessage("Jóváhagyva.")
      } else if (action === "reject") {
        await api.post(`/email/${id}/reject`, {})
        setMessage("Elutasítva.")
      } else if (action === "reply") {
        const res = await api.post(`/email/reply/${id}`, {})
        const generatedReply = normalizeReplyResponse(res)
        if (!generatedReply) throw new Error("A válaszgenerálás nem adott vissza szöveget.")
        setReply(generatedReply)
        startTypewriter(generatedReply)
        setMessage("Válasz elkészült.")
      } else if (action === "reclassify") {
        const res = await api.post(`/email/classify/${id}`, {})
        const classified = normalizeEmailResponse(res)
        if (classified?.error) throw new Error(classified.error)
        setMessage("Osztályozás frissítve.")
      }
      invalidate()
    } catch (err) {
      console.error(`Email action failed: ${action}`, err)
      setError(getApiErrorMessage(err, `Hiba: ${action}`))
    } finally {
      setAction("")
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-[1200px] mx-auto p-8 text-center text-[13px] text-muted-foreground">
        Betöltés…
      </div>
    )
  }

  if (!email) {
    return (
      <div className="max-w-[1200px] mx-auto p-8 text-center text-[13px] text-red-500">
        Email nem található
      </div>
    )
  }

  const sc       = STATUS_CFG[email.status]  ?? STATUS_CFG.new
  const catCfg   = CAT_CFG[email.category]   ?? CAT_CFG.other
  const sentCfg  = SENTIMENT_CFG[email.sentiment]
  const canApprove = ["ai_answered", "needs_attention"].includes(email.status)
  const canReject  = ["ai_answered", "needs_attention"].includes(email.status)
  const canReclass = ["new", "needs_attention"].includes(email.status)
  const effectiveReply = reply ?? email.ai_response ?? ""
  const hasReply = effectiveReply.trim().length > 0
  const aiDecision = parseAiDecision(email.ai_decision)

  return (
    <div className="max-w-[1200px] mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={() => navigate("/email")}
          className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={14} /> Vissza
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-[20px] font-semibold text-foreground tracking-tight truncate">
            {email.subject || "(nincs tárgy)"}
          </h1>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            {email.sender} · {fmtDate(email.created_at)}
          </p>
        </div>
        <Badge cfg={sc} />
      </div>

      {/* Body */}
      <div className="grid gap-5" style={{ gridTemplateColumns: "3fr 2fr" }}>

        {/* ── Left: email content ── */}
        <div className="space-y-4">

          {/* Meta */}
          <div className="bg-card border border-border rounded-xl p-4">
            <MetaRow label="Feladó">{email.sender || "—"}</MetaRow>
            <MetaRow label="Címzett">{email.recipient || "—"}</MetaRow>
            <MetaRow label="Tárgy">{email.subject || "—"}</MetaRow>
            <MetaRow label="Kategória"><Badge cfg={catCfg} /></MetaRow>
            <MetaRow label="Állapot"><Badge cfg={sc} /></MetaRow>
            {email.domain_tag && <MetaRow label="Domain">{email.domain_tag}</MetaRow>}
            {email.veto_reason && (
              <MetaRow label="Megjegyzés">
                <span className="text-amber-600 text-[12px]">{email.veto_reason}</span>
              </MetaRow>
            )}
            {(email.senior_required || email.urgent) && (
              <MetaRow label="Jelzők">
                <div className="flex gap-2">
                  {email.urgent && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600">
                      <AlertTriangle size={11} /> Sürgős
                    </span>
                  )}
                  {email.senior_required && (
                    <span className="text-[11px] font-semibold text-amber-600">Vezető szükséges</span>
                  )}
                </div>
              </MetaRow>
            )}
          </div>

          {/* Email body */}
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-3">
              Email tartalom
            </p>
            <div className="text-[13px] text-foreground leading-relaxed whitespace-pre-wrap">
              {email.body || <span className="text-muted-foreground italic">Nincs szöveges tartalom</span>}
            </div>
          </div>

          {/* RAG sources */}
          {Array.isArray(email.source_docs) && email.source_docs.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <BookOpen size={13} className="text-muted-foreground" />
                <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
                  Tudásbázis forrás
                </p>
              </div>
              <div className="space-y-2">
                {email.source_docs.map((src, i) => (
                  <div key={i} className="bg-muted/40 rounded-lg px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12px] font-medium text-foreground truncate">{src.title || src.id || `Forrás ${i + 1}`}</span>
                      {src.score != null && (
                        <span className="text-[11px] text-muted-foreground flex-shrink-0">
                          {Math.round(src.score * 100)}%
                        </span>
                      )}
                    </div>
                    {src.excerpt && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{src.excerpt}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Right: AI panel + actions ── */}
        <div className="space-y-4">

          {/* Confidence + urgency card */}
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-6 justify-center">
              <ConfRing value={email.confidence} />
              <div className="space-y-3">
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-1">Sürgősség</p>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${(email.urgency_score ?? 0) >= 75 ? "bg-red-500" : (email.urgency_score ?? 0) >= 50 ? "bg-amber-400" : "bg-emerald-400"}`}
                        style={{ width: `${email.urgency_score ?? 0}%` }}
                      />
                    </div>
                    <span className="text-[12px] font-semibold text-foreground tabular-nums">{email.urgency_score ?? 0}</span>
                  </div>
                </div>
                {sentCfg && (
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-1">Hangnem</p>
                    <span className={`text-[13px] font-semibold ${sentCfg.color}`}>{sentCfg.label}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* AI Reply editor */}
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                <Sparkles size={12} className="text-purple-600" />
              </div>
              <p className="text-[13px] font-semibold text-foreground">AI válasz</p>
            </div>

            {canApprove || canReject ? (
              isTyping ? (
                <div
                  onClick={() => skipTypewriter(reply ?? "")}
                  title="Kattints a kihagyáshoz"
                  className="cursor-pointer rounded-xl border border-purple-200 bg-purple-50/40 px-4 py-3 text-[13px] text-foreground leading-relaxed whitespace-pre-wrap min-h-[140px] select-none"
                >
                  {displayedReply}
                  <span className="inline-block w-[2px] h-[0.9em] bg-purple-500 ml-[1px] align-middle animate-pulse" />
                </div>
              ) : (
                <ReplyEditor
                  value={effectiveReply}
                  onChange={v => { setReply(v); setDisped(v) }}
                />
              )
            ) : (
              <div className="bg-muted/40 rounded-xl px-4 py-3 text-[13px] text-foreground leading-relaxed whitespace-pre-wrap min-h-[80px]">
                {email.ai_response || <span className="text-muted-foreground italic">Nincs AI válasz</span>}
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-[11px] text-red-700">
              {error}
            </div>
          )}
          {message && (
            <div className="px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-[11px] text-emerald-700">
              {message}
            </div>
          )}

          {/* Action buttons */}
          <div className="space-y-2">
            {!email.ai_response && (
              <button
                onClick={() => doAction("reply")}
                disabled={!!actionLoad}
                className="w-full flex items-center justify-center gap-2 h-10 bg-purple-600 hover:bg-purple-700 text-white text-[13px] font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                <Sparkles size={15} />
                {actionLoad === "reply" ? "Generálás…" : "Választ generál"}
              </button>
            )}
            {canApprove && (
              <button
                onClick={() => doAction("approve")}
                disabled={!!actionLoad || !hasReply}
                className="w-full flex items-center justify-center gap-2 h-10 bg-emerald-600 hover:bg-emerald-700 text-white text-[13px] font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                <CheckCircle size={15} />
                {actionLoad === "approve" ? "Küldés…" : "Jóváhagyás és küldés"}
              </button>
            )}
            {canReject && (
              <button
                onClick={() => doAction("reject")}
                disabled={!!actionLoad}
                className="w-full flex items-center justify-center gap-2 h-10 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-[13px] font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                <XCircle size={15} />
                {actionLoad === "reject" ? "…" : "Elutasítás"}
              </button>
            )}
            {canReclass && (
              <button
                onClick={() => doAction("reclassify")}
                disabled={!!actionLoad}
                className="w-full flex items-center justify-center gap-2 h-10 border border-border text-[13px] text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors disabled:opacity-50"
              >
                <RefreshCw size={13} />
                {actionLoad === "reclassify" ? "Osztályozás…" : "Újraosztályozás"}
              </button>
            )}
          </div>

          {/* AI decision raw (collapsed) */}
          {aiDecision && (
            <details className="text-[11px] text-muted-foreground">
              <summary className="cursor-pointer hover:text-foreground transition-colors">AI döntés részletei</summary>
              <pre className="mt-2 p-3 bg-muted/50 rounded-lg overflow-x-auto text-[10px] leading-relaxed">
                {JSON.stringify(aiDecision, null, 2)}
              </pre>
            </details>
          )}
        </div>
      </div>
    </div>
  )
}
