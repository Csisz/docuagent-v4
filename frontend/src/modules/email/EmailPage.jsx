import { useState } from "react"
import { Mail, Users, Archive, ChevronRight, Sparkles, AlertTriangle } from "lucide-react"

// ── Mock data (Email Agent backend is in development) ──────────
const MOCK_EMAILS = [
  {
    id: 1,
    sender: "Kovács Péter",
    email: "kovacs.peter@example.hu",
    subject: "RE: Order #442 — Delivery delay",
    preview: "I have been waiting 5 days and still no upd...",
    tag: "Attention",
    tagStyle: "text-red-600 bg-red-50 border-red-200",
    time: "10:42",
    body: `Dear Support Team,

I have been waiting for 5 days now and still have not received any update about my order (#442). This level of service is simply unacceptable — I was promised a 3-day delivery window.

I would like to know immediately when my package will arrive, and what compensation you are offering for this inconvenience.

Regards,
Kovács Péter`,
    aiReply: `Dear Kovács Péter,

Thank you for reaching out regarding Order #442. We sincerely apologize for the inconvenience — your order has been prioritized and is now scheduled for delivery by May 2nd.`,
    classification: "Customer Complaint",
    classStyle: "text-red-600 bg-red-50 border-red-200",
    classIcon: AlertTriangle,
    confidence: 91,
    suggestion: "Send empathetic apology with new delivery date (May 2nd) + 10% discount offer. Escalation not required.",
  },
  {
    id: 2,
    sender: "Beta Kft.",
    email: "info@betakft.hu",
    subject: "Invoice INV-2024-0893 attached",
    preview: "Dear Partner, please find our invoice for A...",
    tag: "AI Answered",
    tagStyle: "text-emerald-600 bg-emerald-50 border-emerald-200",
    time: "09:15",
    body: "Dear Partner, please find our invoice for August attached. Please process at your earliest convenience.",
    aiReply: null,
    classification: "Invoice",
    classStyle: "text-blue-600 bg-blue-50 border-blue-200",
    classIcon: Mail,
    confidence: 97,
    suggestion: "Auto-routed to invoice processing pipeline. No manual action needed.",
  },
  {
    id: 3,
    sender: "Gamma Solutions",
    email: "contact@gammasolutions.hu",
    subject: "Q2 strategy meeting request",
    preview: "We would like to schedule a call for Q2 de...",
    tag: "New",
    tagStyle: "text-blue-600 bg-blue-50 border-blue-200",
    time: "Yesterday",
    body: "We would like to schedule a call for Q2 discussions. Please let us know your availability for next week.",
    aiReply: null,
    classification: "Meeting Request",
    classStyle: "text-violet-600 bg-violet-50 border-violet-200",
    classIcon: Users,
    confidence: 88,
    suggestion: "Respond with available time slots for next week.",
  },
  {
    id: 4,
    sender: "Delta Tech",
    email: "billing@deltatech.hu",
    subject: "Payment reminder · INV-0780",
    preview: "Gentle reminder that INV-0780 is now 14...",
    tag: "New",
    tagStyle: "text-blue-600 bg-blue-50 border-blue-200",
    time: "Yesterday",
    body: "Gentle reminder that invoice INV-0780 is now 14 days overdue. Please arrange payment at your earliest convenience.",
    aiReply: null,
    classification: "Payment Reminder",
    classStyle: "text-amber-600 bg-amber-50 border-amber-200",
    classIcon: Mail,
    confidence: 94,
    suggestion: "Acknowledge receipt and confirm payment timeline within 2 business days.",
  },
  {
    id: 5,
    sender: "Epsilon Partners",
    email: "legal@epsilon.hu",
    subject: "Document verification required",
    preview: "Please verify the attached compliance d...",
    tag: "Closed",
    tagStyle: "text-muted-foreground bg-muted border-border",
    time: "Mon",
    body: "Please verify the attached compliance document at your earliest convenience.",
    aiReply: null,
    classification: "Document Request",
    classStyle: "text-teal-600 bg-teal-50 border-teal-200",
    classIcon: Archive,
    confidence: 82,
    suggestion: "Closed. No action required.",
  },
]

const NEW_COUNT = MOCK_EMAILS.filter(e => e.tag === "Attention" || e.tag === "New").length

// ── Page ───────────────────────────────────────────────────────
export default function EmailPage() {
  const [selectedId, setSelectedId] = useState(1)
  const [replyText, setReplyText]   = useState("")

  const selected = MOCK_EMAILS.find(e => e.id === selectedId)

  function handleSelectEmail(email) {
    setSelectedId(email.id)
    setReplyText(email.aiReply || "")
  }

  return (
    <div className="max-w-[1400px] mx-auto">
      <div className="grid grid-cols-[260px_1fr_260px] gap-0 bg-card border border-border rounded-xl overflow-hidden" style={{ height: "calc(100vh - 140px)" }}>

        {/* ── Left: Inbox list ── */}
        <div className="flex flex-col border-r border-border">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
            <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
              Inbox
            </span>
            {NEW_COUNT > 0 && (
              <span className="text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                {NEW_COUNT} NEW
              </span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-border">
            {MOCK_EMAILS.map(email => (
              <button
                key={email.id}
                onClick={() => handleSelectEmail(email)}
                className={[
                  "w-full text-left px-4 py-4 transition-all border-l-2",
                  email.id === selectedId
                    ? "bg-blue-50/60 border-l-blue-500"
                    : "border-l-transparent hover:bg-muted/30",
                ].join(" ")}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[13px] font-semibold text-foreground truncate mr-2">
                    {email.sender}
                  </span>
                  <span className="text-[10px] text-muted-foreground flex-shrink-0">{email.time}</span>
                </div>
                <p className="text-[12px] font-medium text-foreground truncate mb-1">{email.subject}</p>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] text-muted-foreground truncate flex-1">{email.preview}</p>
                  <span className={`flex-shrink-0 text-[9px] font-semibold border px-1.5 py-0.5 rounded-full ${email.tagStyle}`}>
                    {email.tag}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ── Middle: Email content + reply ── */}
        {selected && (
          <div className="flex flex-col border-r border-border">
            {/* Email header */}
            <div className="px-6 py-4 border-b border-border flex-shrink-0">
              <h2 className="text-[15px] font-semibold text-foreground mb-0.5">{selected.subject}</h2>
              <p className="text-[12px] text-muted-foreground">From: {selected.email}</p>
            </div>

            {/* Email body */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="text-[13px] text-foreground leading-relaxed whitespace-pre-wrap">
                {selected.body}
              </div>

              {/* Reply area */}
              <div className="mt-6 border border-border rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/30">
                  <span className="text-[11px] font-medium text-muted-foreground">Reply</span>
                </div>
                <textarea
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  placeholder="Write your reply..."
                  rows={5}
                  className="w-full px-4 py-3 text-[13px] text-foreground bg-transparent resize-none focus:outline-none placeholder:text-muted-foreground/50"
                />
                <div className="flex items-center gap-2 px-4 py-3 border-t border-border bg-muted/20">
                  <button className="flex items-center gap-1.5 h-8 px-4 bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-medium rounded-lg transition-colors">
                    <Mail size={12} /> Send Reply
                  </button>
                  <button className="h-8 px-4 border border-border text-[12px] text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">
                    Save Draft
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Right: AI Copilot ── */}
        {selected && (
          <div className="flex flex-col overflow-y-auto">
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border flex-shrink-0">
              <div className="w-7 h-7 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                <Sparkles size={13} className="text-purple-600" />
              </div>
              <span className="text-[13px] font-semibold text-foreground">AI Copilot</span>
            </div>

            <div className="p-4 space-y-5">
              {/* Classification */}
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-2">
                  Classification
                </p>
                <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold border px-2.5 py-1 rounded-lg ${selected.classStyle}`}>
                  <selected.classIcon size={11} />
                  {selected.classification}
                </span>
              </div>

              {/* Confidence */}
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-2">
                  Confidence
                </p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                      style={{ width: `${selected.confidence}%` }}
                    />
                  </div>
                  <span className="text-[12px] font-semibold text-foreground tabular-nums">
                    {selected.confidence}%
                  </span>
                </div>
              </div>

              {/* AI Suggestion */}
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-2">
                  AI Suggestion
                </p>
                <div className="bg-purple-50 border border-purple-100 rounded-xl p-3">
                  <p className="text-[12px] text-foreground leading-relaxed">{selected.suggestion}</p>
                </div>
              </div>

              {/* Quick Actions */}
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-2">
                  Quick Actions
                </p>
                <div className="space-y-1.5">
                  {selected.aiReply && (
                    <button
                      onClick={() => setReplyText(selected.aiReply)}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-[12px] font-medium transition-colors"
                    >
                      <Sparkles size={12} /> Use AI reply
                    </button>
                  )}
                  <button className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-border text-[12px] text-foreground hover:bg-muted transition-colors">
                    <Users size={12} className="text-muted-foreground" /> Escalate to manager
                  </button>
                  <button className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-border text-[12px] text-foreground hover:bg-muted transition-colors">
                    <Archive size={12} className="text-muted-foreground" /> Archive email
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
