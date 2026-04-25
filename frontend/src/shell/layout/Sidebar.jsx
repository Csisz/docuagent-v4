/**
 * V4 Sidebar â€” dynamic, module-aware.
 *
 * Navigation sections:
 *   CORE    â€” always visible (Dashboard, Approvals)
 *   MODULES â€” shown only if module is enabled
 *   ADMIN   â€” admin role only
 *
 * Design: dark sidebar, clean icons, subtle active state.
 * TODO: swap placeholder icons for lucide-react icons.
 */
import { NavLink } from "react-router-dom"
import { useAuth }    from "@/core/auth/AuthContext"
import { useModules } from "@/core/modules/ModuleContext"
import clsx from "clsx"

// â”€â”€ Nav config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const CORE_NAV = [
  { to: "/",          label: "Dashboard",   icon: "â–¦" },
  { to: "/approvals", label: "JĂłvĂˇhagyĂˇsok", icon: "âś“" },
]

const MODULE_NAV = [
  { module: "invoice_agent",  to: "/invoice",  label: "Invoice Agent",  icon: "â—" },
  { module: "email_agent",    to: "/email",    label: "Email Agent",    icon: "â—‰" },
  { module: "document_agent", to: "/document", label: "Document Agent", icon: "â—§" },
]

const ADMIN_NAV = [
  { to: "/settings",     label: "BeĂˇllĂ­tĂˇsok",  icon: "âš™" },
  { to: "/audit",        label: "Audit Log",    icon: "â‰ˇ" },
]

const linkClass = (active) => clsx(
  "flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-100",
  active
    ? "bg-white/10 text-white"
    : "text-white/50 hover:text-white/80 hover:bg-white/5"
)

export default function Sidebar() {
  const { user, logout }  = useAuth()
  const { isEnabled }     = useModules()
  const enabledModules    = MODULE_NAV.filter(m => isEnabled(m.module))

  return (
    <aside className="w-[240px] flex-shrink-0 h-screen flex flex-col bg-[#0f1929] border-r border-white/[0.07]">

      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-white/[0.07]">
        <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white text-xs font-bold">D</div>
        <div>
          <div className="text-[14px] font-semibold text-white leading-none">DocuAgent</div>
          <div className="text-[10px] text-white/30 mt-0.5">v4</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">

        <NavSection label="FĹ‘menĂĽ">
          {CORE_NAV.map(item => (
            <NavLink key={item.to} to={item.to} end={item.to === "/"} className={({ isActive }) => linkClass(isActive)}>
              <span className="text-[14px] opacity-60">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </NavSection>

        {enabledModules.length > 0 && (
          <NavSection label="Modulok">
            {enabledModules.map(item => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => linkClass(isActive)}>
                <span className="text-[14px] opacity-60">{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </NavSection>
        )}

        {user?.role === "admin" && (
          <NavSection label="Admin">
            {ADMIN_NAV.map(item => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => linkClass(isActive)}>
                <span className="text-[14px] opacity-60">{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </NavSection>
        )}

      </nav>

      {/* User */}
      <div className="px-3 py-3 border-t border-white/[0.07]">
        <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0">
            {(user?.full_name || user?.email || "?").slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-medium text-white/80 truncate leading-none">{user?.full_name || user?.email}</div>
            <div className="text-[10px] text-white/30 mt-0.5">{user?.role}</div>
          </div>
          <button onClick={logout} className="text-white/20 hover:text-white/50 text-[11px] transition-colors">Ki</button>
        </div>
      </div>

    </aside>
  )
}

function NavSection({ label, children }) {
  return (
    <div>
      <div className="text-[9.5px] font-semibold text-white/25 uppercase tracking-[.15em] px-3 mb-1">{label}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}
