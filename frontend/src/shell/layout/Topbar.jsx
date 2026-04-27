import { useLocation } from "react-router-dom"
import { useGet } from "@/core/hooks/useApi"
import { ChevronRight, Bell } from "lucide-react"

const ROUTES = {
  "/":          { label: "Dashboard",     parent: null },
  "/approvals": { label: "Jóváhagyások",  parent: "Főmenü" },
  "/email":     { label: "Email Agent",   parent: "Modulok" },
  "/invoice":   { label: "Invoice Agent", parent: "Modulok" },
  "/document":  { label: "Document Agent",parent: "Modulok" },
  "/crm":       { label: "CRM",           parent: "Modulok" },
  "/calendar":  { label: "Naptár",        parent: "Modulok" },
  "/agents":    { label: "Agent Builder", parent: "Modulok" },
  "/settings":  { label: "Beállítások",   parent: "Admin" },
  "/audit":     { label: "Audit Log",     parent: "Admin" },
}

export default function Topbar() {
  const { pathname } = useLocation()
  const route = ROUTES[pathname] ?? { label: "DocuAgent", parent: null }

  const { data: approvals } = useGet("approvals-count", "/core/approve?status=pending&limit=1")
  const pendingCount = approvals?.total ?? 0

  return (
    <header className="h-14 flex items-center justify-between px-6 border-b border-border bg-background flex-shrink-0">

      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-[13px]">
        {route.parent && (
          <>
            <span className="text-muted-foreground/50 font-medium">{route.parent}</span>
            <ChevronRight size={13} className="text-muted-foreground/30" />
          </>
        )}
        <span className="font-semibold text-foreground">{route.label}</span>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2">
        {pendingCount > 0 && (
          <span className="text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-100 px-2.5 py-1 rounded-full">
            {pendingCount} jóváhagyás vár
          </span>
        )}
        <button
          className="relative w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-150"
          title="Értesítések"
        >
          <Bell size={15} />
          {pendingCount > 0 && (
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-amber-500 rounded-full" />
          )}
        </button>
      </div>

    </header>
  )
}
