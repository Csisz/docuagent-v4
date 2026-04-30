import { useState } from "react"
import { Inbox, Clock } from "lucide-react"
import EmailListPage from "./EmailListPage"

export default function EmailPage() {
  const [tab, setTab] = useState("inbox")

  return (
    <div className="max-w-[1200px] mx-auto space-y-5">

      {/* Header */}
      <div className="pt-1">
        <h1 className="text-[22px] font-semibold text-foreground tracking-tight">Email Agent</h1>
        <p className="text-[13px] text-muted-foreground mt-0.5">AI-asszisztált emailkezelés és válaszgenerálás</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 border-b border-border">
        <TabBtn active={tab === "inbox"} icon={Inbox} onClick={() => setTab("inbox")}>
          Beérkező
        </TabBtn>
        <TabBtn active={tab === "approval"} icon={Clock} onClick={() => setTab("approval")}>
          Jóváhagyásra vár
        </TabBtn>
      </div>

      {/* Content */}
      {tab === "inbox"    && <EmailListPage key="inbox" />}
      {tab === "approval" && <EmailListPage key="approval" defaultStatus="ai_answered" />}

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
