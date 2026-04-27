import { NavLink } from "react-router-dom"
import { useAuth }    from "@/core/auth/AuthContext"
import { useModules } from "@/core/modules/ModuleContext"
import {
  LayoutDashboard, CheckSquare, Mail, FileText, BookOpen,
  Users, Calendar, Zap, Settings, ScrollText, LogOut,
} from "lucide-react"
import clsx from "clsx"

// ── Nav config ─────────────────────────────────────────────────
const CORE_NAV = [
  { to: "/",          end: true,  label: "Dashboard",    Icon: LayoutDashboard },
  { to: "/approvals", end: false, label: "Jóváhagyások", Icon: CheckSquare },
]

const MODULE_NAV = [
  { module: "email_agent",     to: "/email",    label: "Email Agent",    Icon: Mail },
  { module: "invoice_agent",   to: "/invoice",  label: "Invoice Agent",  Icon: FileText },
  { module: "document_agent",  to: "/document", label: "Document Agent", Icon: BookOpen },
  { module: "crm_module",      to: "/crm",      label: "CRM",            Icon: Users },
  { module: "calendar_module", to: "/calendar", label: "Naptár",         Icon: Calendar },
  { module: "agent_builder",   to: "/agents",   label: "Agent Builder",  Icon: Zap },
]

const ADMIN_NAV = [
  { to: "/settings", label: "Beállítások", Icon: Settings },
  { to: "/audit",    label: "Audit Log",   Icon: ScrollText },
]

// ── NavItem ────────────────────────────────────────────────────
function NavItem({ to, end, label, Icon }) {
  return (
    <NavLink to={to} end={end ?? false} className="block">
      {({ isActive }) => (
        <div
          className={clsx(
            "relative flex items-center gap-2.5 px-3 py-[7px] rounded-lg text-[13px] font-medium transition-all duration-150",
            isActive
              ? "bg-white/10 text-white"
              : "text-white/50 hover:text-white/80 hover:bg-white/[0.06]"
          )}
        >
          {isActive && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-blue-400 rounded-r-full" />
          )}
          <Icon
            size={14}
            strokeWidth={2}
            className={clsx(
              "flex-shrink-0 transition-colors duration-150",
              isActive ? "text-blue-400" : "text-white/35"
            )}
          />
          <span>{label}</span>
        </div>
      )}
    </NavLink>
  )
}

// ── NavSection ─────────────────────────────────────────────────
function NavSection({ label, children }) {
  return (
    <div>
      <div className="text-[9px] font-semibold text-white/20 uppercase tracking-[.18em] px-3 mb-1.5">
        {label}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}

// ── Sidebar ────────────────────────────────────────────────────
export default function Sidebar() {
  const { user, logout } = useAuth()
  const { isEnabled }    = useModules()

  const enabledModules = MODULE_NAV.filter(m => isEnabled(m.module))

  const initials = (user?.full_name || user?.email || "?")
    .split(/\s+/)
    .map(w => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase()

  return (
    <aside className="w-[220px] flex-shrink-0 h-screen flex flex-col bg-[#0f1929] border-r border-white/[0.06]">

      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 h-14 border-b border-white/[0.06] flex-shrink-0">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-[12px] font-bold shadow-sm flex-shrink-0">
          D
        </div>
        <div>
          <div className="text-[13.5px] font-semibold text-white leading-none">DocuAgent</div>
          <div className="text-[9px] text-white/25 mt-0.5 font-medium tracking-wider">AI PLATFORM</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">

        <NavSection label="Főmenü">
          {CORE_NAV.map(item => <NavItem key={item.to} {...item} />)}
        </NavSection>

        {enabledModules.length > 0 && (
          <NavSection label="Modulok">
            {enabledModules.map(item => <NavItem key={item.to} {...item} />)}
          </NavSection>
        )}

        {user?.role === "admin" && (
          <NavSection label="Admin">
            {ADMIN_NAV.map(item => <NavItem key={item.to} {...item} />)}
          </NavSection>
        )}

      </nav>

      {/* User footer */}
      <div className="px-3 py-3 border-t border-white/[0.06] flex-shrink-0">
        <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 shadow-sm">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-medium text-white/80 truncate leading-none">
              {user?.full_name || user?.email}
            </div>
            <div className="text-[9.5px] text-white/30 mt-0.5 capitalize">{user?.role}</div>
          </div>
          <button
            onClick={logout}
            title="Kijelentkezés"
            className="flex-shrink-0 p-1 rounded text-white/20 hover:text-white/60 hover:bg-white/5 transition-all duration-150"
          >
            <LogOut size={13} />
          </button>
        </div>
      </div>

    </aside>
  )
}
