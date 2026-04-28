import { useLocation } from "react-router-dom"
import { useGet } from "@/core/hooks/useApi"
import { ChevronRight, Bell, Search } from "lucide-react"

const ROUTES = {
  "/":          { label: "Dashboard",    parent: null      },
  "/approvals": { label: "Approvals",   parent: "Core"    },
  "/email":     { label: "Email Agent", parent: "Modules" },
  "/invoice":   { label: "Invoice Agent", parent: "Modules" },
  "/document":  { label: "Documents",   parent: "Modules" },
  "/crm":       { label: "CRM",         parent: "Modules" },
  "/calendar":  { label: "Calendar",    parent: "Modules" },
  "/agents":    { label: "Agent Builder", parent: "Modules" },
  "/settings":  { label: "Settings",    parent: "Admin"   },
  "/audit":     { label: "Audit Log",   parent: "Admin"   },
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
        {/* Search */}
        <button className="flex items-center gap-2 h-8 px-3 rounded-lg border border-border bg-muted/50 text-muted-foreground hover:bg-muted transition-colors duration-150">
          <Search size={13} />
          <span className="text-[12px] hidden sm:block">Quick search...</span>
          <kbd className="hidden sm:flex items-center gap-0.5 text-[10px] font-medium bg-background border border-border rounded px-1 py-0.5 leading-none">
            ⌘K
          </kbd>
        </button>

        {/* Notification bell */}
        <button
          className="relative w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-150"
          title="Notifications"
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
