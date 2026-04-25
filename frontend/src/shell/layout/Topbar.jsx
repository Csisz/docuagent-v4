/**
 * V4 Topbar â€” minimal.
 * Shows current page title + pending approval badge + user quick actions.
 * TODO: add notification bell, global search.
 */
import { useLocation } from "react-router-dom"
import { useGet } from "@/core/hooks/useApi"

const PAGE_TITLES = {
  "/":          "Dashboard",
  "/approvals": "JĂłvĂˇhagyĂˇsok",
  "/invoice":   "Invoice Agent",
  "/email":     "Email Agent",
  "/document":  "Document Agent",
  "/settings":  "BeĂˇllĂ­tĂˇsok",
  "/audit":     "Audit Log",
}

export default function Topbar() {
  const { pathname } = useLocation()
  const title = PAGE_TITLES[pathname] ?? "DocuAgent"

  // Pending approvals count
  const { data: approvals } = useGet("approvals-count", "/core/approve?status=pending&limit=1")
  const pendingCount = approvals?.total ?? 0

  return (
    <header className="h-14 flex items-center justify-between px-6 border-b border-border bg-background flex-shrink-0">
      <h1 className="text-[15px] font-semibold text-foreground">{title}</h1>
      <div className="flex items-center gap-3">
        {pendingCount > 0 && (
          <span className="text-[11px] bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 font-medium px-2 py-0.5 rounded-full">
            {pendingCount} jĂłvĂˇhagyĂˇs vĂˇr
          </span>
        )}
      </div>
    </header>
  )
}
