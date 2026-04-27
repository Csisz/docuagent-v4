import { useState, useRef } from "react"
import { FileText, BarChart3, ListOrdered, Upload } from "lucide-react"
import InvoiceList from "./InvoiceList"
import InvoiceStats from "./InvoiceStats"
import InvoiceQueue from "./InvoiceQueue"

export default function InvoicePage() {
  const [tab, setTab]           = useState("list")
  const [statsKey, setStatsKey] = useState(0)
  const queueFileInputRef       = useRef(null)

  function handleRefreshStats() {
    setStatsKey(k => k + 1)
  }

  return (
    <div className="max-w-[1200px] mx-auto space-y-5">

      {/* Header */}
      <div className="pt-1 flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-semibold text-foreground tracking-tight">Invoice Agent</h1>
          <p className="text-[12px] text-muted-foreground mt-0.5">Számla feldolgozás és exportálás</p>
        </div>
        {(tab === "list" || tab === "queue") && (
          <button
            onClick={() => {
              setTab("queue")
              setTimeout(() => queueFileInputRef.current?.click(), 50)
            }}
            className="flex items-center gap-2 h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-medium rounded-lg transition-colors"
          >
            <Upload size={14} />
            Fájlok feltöltése
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 border-b border-border">
        <TabBtn active={tab === "list"} icon={FileText} onClick={() => setTab("list")}>
          Lista
        </TabBtn>
        <TabBtn active={tab === "queue"} icon={ListOrdered} onClick={() => setTab("queue")}>
          Feldolgozási sor
        </TabBtn>
        <TabBtn active={tab === "stats"} icon={BarChart3} onClick={() => setTab("stats")}>
          Statisztikák
        </TabBtn>
      </div>

      {/* Content */}
      {tab === "list"  && <InvoiceList />}
      {tab === "queue" && <InvoiceQueue onRefreshStats={handleRefreshStats} fileInputRef={queueFileInputRef} />}
      {tab === "stats" && <InvoiceStats key={statsKey} />}

    </div>
  )
}

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
