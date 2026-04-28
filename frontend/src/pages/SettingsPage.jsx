import { useState } from "react"
import { CheckCircle, XCircle, Loader2, ExternalLink, Settings, Puzzle } from "lucide-react"

export default function SettingsPage() {
  const [tab, setTab] = useState("integrations")

  return (
    <div className="max-w-[800px] mx-auto space-y-5">

      {/* Header */}
      <div className="pt-1">
        <h1 className="text-[22px] font-semibold text-foreground tracking-tight">Settings</h1>
        <p className="text-[13px] text-muted-foreground mt-0.5">System and integration settings</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 border-b border-border">
        <TabBtn active={tab === "integrations"} icon={Puzzle} onClick={() => setTab("integrations")}>
          Integrations
        </TabBtn>
        <TabBtn active={tab === "general"} icon={Settings} onClick={() => setTab("general")}>
          General
        </TabBtn>
      </div>

      {tab === "integrations" && <IntegrationsTab />}
      {tab === "general" && (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <Settings size={28} className="text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-[14px] font-medium text-foreground">General Settings</p>
          <p className="text-[13px] text-muted-foreground mt-1">Coming soon.</p>
        </div>
      )}
    </div>
  )
}

// ── Integrations tab ───────────────────────────────────────────
function IntegrationsTab() {
  return (
    <div className="space-y-4">
      <BillingoSection />
    </div>
  )
}

function BillingoSection() {
  const [apiKey,  setApiKey]  = useState("")
  const [testing, setTesting] = useState(false)
  const [result,  setResult]  = useState(null)   // { connected: bool, error?: str }

  async function handleTest() {
    if (!apiKey.trim()) return
    setTesting(true)
    setResult(null)
    try {
      const token = localStorage.getItem("access_token")
      const res   = await fetch("/settings/billingo-test", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ api_key: apiKey.trim() }),
      })
      const json = await res.json().catch(() => ({}))
      setResult(json?.data ?? json)
    } catch (err) {
      setResult({ connected: false, error: err.message })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-[15px] font-semibold text-foreground">Billingo</h2>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Invoice export to Billingo accounting software (API v3)
          </p>
        </div>
        <a
          href="https://app.billingo.hu/api-key"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-[12px] text-blue-600 hover:text-blue-700 transition-colors flex-shrink-0"
        >
          API Key page <ExternalLink size={11} />
        </a>
      </div>

      {/* API key input */}
      <div className="space-y-1.5">
        <label className="text-[12px] font-medium text-foreground">Billingo API Key</label>
        <input
          type="password"
          value={apiKey}
          onChange={e => { setApiKey(e.target.value); setResult(null) }}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          className="w-full h-9 px-3 text-[13px] rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 font-mono"
        />
        <p className="text-[11px] text-muted-foreground">
          Also set <code className="bg-muted px-1 py-0.5 rounded text-[10px]">BILLINGO_API_KEY</code> in the backend <code className="bg-muted px-1 py-0.5 rounded text-[10px]">.env</code> file.
        </p>
      </div>

      {/* Test button + result */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleTest}
          disabled={!apiKey.trim() || testing}
          className="flex items-center gap-1.5 h-9 px-4 text-[13px] font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {testing
            ? <><Loader2 size={13} className="animate-spin" /> Testing…</>
            : "Test Connection"
          }
        </button>

        {result !== null && (
          result.connected ? (
            <div className="flex items-center gap-1.5 text-[13px] font-medium text-emerald-600">
              <CheckCircle size={15} />
              Connected — API key is valid
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-[13px] font-medium text-red-600">
              <XCircle size={15} />
              {result.error ? `Error: ${result.error}` : "Invalid API key"}
            </div>
          )
        )}
      </div>

      {/* Usage note */}
      <div className="text-[11px] text-muted-foreground bg-muted/50 rounded-lg p-3 leading-relaxed border border-border">
        <strong>Note:</strong> DocuAgent records incoming invoices in Billingo as expense-type documents.
        Export is available for invoices with <em>Verified</em> status in the validator view.
      </div>
    </div>
  )
}

// ── Tab button ─────────────────────────────────────────────────
function TabBtn({ active, icon: Icon, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={[
        "flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors duration-150",
        active
          ? "border-blue-500 text-blue-600"
          : "border-transparent text-muted-foreground hover:text-foreground",
      ].join(" ")}
    >
      <Icon size={14} />
      {children}
    </button>
  )
}
