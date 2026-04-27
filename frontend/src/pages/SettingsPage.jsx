import { useState } from "react"
import { CheckCircle, XCircle, Loader2, ExternalLink } from "lucide-react"

export default function SettingsPage() {
  const [tab, setTab] = useState("integrations")

  return (
    <div className="max-w-[800px] mx-auto space-y-5">

      {/* Header */}
      <div className="pt-1">
        <h1 className="text-[20px] font-semibold text-foreground tracking-tight">Beállítások</h1>
        <p className="text-[12px] text-muted-foreground mt-0.5">Rendszer- és integrációs beállítások</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 border-b border-border">
        <TabBtn active={tab === "integrations"} onClick={() => setTab("integrations")}>
          Integrációk
        </TabBtn>
        <TabBtn active={tab === "general"} onClick={() => setTab("general")}>
          Általános
        </TabBtn>
      </div>

      {tab === "integrations" && <IntegrationsTab />}
      {tab === "general" && (
        <div className="bg-card border border-border rounded-xl p-6 text-[13px] text-muted-foreground">
          Általános beállítások hamarosan elérhetők.
        </div>
      )}
    </div>
  )
}

// ── Integrations tab ─────────────────────────────────────────────

function IntegrationsTab() {
  return (
    <div className="space-y-4">
      <BillingoSection />
    </div>
  )
}

function BillingoSection() {
  const [apiKey,    setApiKey]    = useState("")
  const [testing,   setTesting]   = useState(false)
  const [result,    setResult]    = useState(null)   // { connected: bool, error?: str }

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
    <div className="bg-card border border-border rounded-xl p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[15px] font-semibold text-foreground">Billingo</h2>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Számla exportálás Billingo könyvelőprogramba (API v3)
          </p>
        </div>
        <a
          href="https://app.billingo.hu/api-key"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-[12px] text-blue-600 hover:text-blue-700"
        >
          API kulcs oldal <ExternalLink size={11} />
        </a>
      </div>

      {/* API key input */}
      <div className="space-y-1.5">
        <label className="text-[12px] font-medium text-foreground">Billingo API kulcs</label>
        <input
          type="password"
          value={apiKey}
          onChange={e => { setApiKey(e.target.value); setResult(null) }}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          className="w-full h-9 px-3 text-[13px] rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 font-mono"
        />
        <p className="text-[11px] text-muted-foreground">
          A kulcsot a <code className="bg-muted px-1 py-0.5 rounded text-[10px]">BILLINGO_API_KEY</code> környezeti változóba is be kell illeszteni a backend .env fájlba.
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
            ? <><Loader2 size={13} className="animate-spin" /> Tesztelés...</>
            : "Kapcsolat tesztelése"
          }
        </button>

        {result !== null && (
          result.connected ? (
            <div className="flex items-center gap-1.5 text-[13px] font-medium text-emerald-600">
              <CheckCircle size={15} />
              Kapcsolódva — API kulcs érvényes
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-[13px] font-medium text-red-600">
              <XCircle size={15} />
              {result.error ? `Hiba: ${result.error}` : "Hibás API kulcs"}
            </div>
          )
        )}
      </div>

      {/* Usage note */}
      <div className="text-[11px] text-muted-foreground bg-muted/50 rounded-lg p-3 leading-relaxed">
        <strong>Megjegyzés:</strong> A DocuAgent bejövő számlákat rögzít Billingóban (kiadás jellegű dokumentum).
        Az exportálás a <em>Verified</em> (Ellenőrizve) státuszú számláknál érhető el a validátor felületen.
      </div>
    </div>
  )
}

// ── Tab button ───────────────────────────────────────────────────

function TabBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={[
        "px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors duration-150",
        active
          ? "border-blue-500 text-blue-600"
          : "border-transparent text-muted-foreground hover:text-foreground",
      ].join(" ")}
    >
      {children}
    </button>
  )
}
