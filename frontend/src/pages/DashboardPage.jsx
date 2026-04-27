import { useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { useModules } from "@/core/modules/ModuleContext"
import { useAuth } from "@/core/auth/AuthContext"
import { useGet } from "@/core/hooks/useApi"
import {
  Mail, FileText, BookOpen, Users, Calendar, Zap,
  Clock, Activity, Sparkles, CheckCircle2, Lock,
  ArrowUpRight, TrendingUp,
} from "lucide-react"

// ── Module registry ────────────────────────────────────────────
const MODULE_INFO = {
  email_agent:    { label: "Email Agent",    desc: "Email osztályozás és automatizálás", gradient: "from-violet-500 to-purple-600",  Icon: Mail,     route: "/email" },
  invoice_agent:  { label: "Invoice Agent",  desc: "Számla feldolgozás és exportálás",   gradient: "from-blue-500 to-indigo-600",    Icon: FileText, route: "/invoice" },
  document_agent: { label: "Document Agent", desc: "Dokumentum elemzés és RAG",          gradient: "from-teal-500 to-cyan-600",      Icon: BookOpen, route: "/document" },
  crm_module:     { label: "CRM",            desc: "Kapcsolatok és ügyek kezelése",       gradient: "from-orange-500 to-amber-600",   Icon: Users,    route: "/crm" },
  calendar_module:{ label: "Naptár",         desc: "Google Calendar szinkronizáció",      gradient: "from-green-500 to-emerald-600",  Icon: Calendar, route: "/calendar" },
  agent_builder:  { label: "Agent Builder",  desc: "Egyedi AI agent létrehozása",         gradient: "from-rose-500 to-pink-600",      Icon: Zap,      route: "/agents" },
}

// ── Activity mock data ─────────────────────────────────────────
const ACTIVITY = [
  { Icon: FileText,     bg: "bg-blue-50",    ic: "text-blue-600",    text: "Számla feldolgozva: INV-2024-0892",   sub: "Könyvelési exportra vár",       time: "2 perce" },
  { Icon: Mail,         bg: "bg-violet-50",  ic: "text-violet-600",  text: "47 email osztályozva",                sub: "12 prioritásos, 8 megrendelés", time: "15 perce" },
  { Icon: CheckCircle2, bg: "bg-emerald-50", ic: "text-emerald-600", text: "Jóváhagyás elvégezve",                sub: "Könyvelési export #2024-11",     time: "1 órája" },
  { Icon: BookOpen,     bg: "bg-teal-50",    ic: "text-teal-600",    text: "Dokumentum feltöltve",                sub: "Szerződés_2024_Q4.pdf",          time: "2 órája" },
  { Icon: Zap,          bg: "bg-rose-50",    ic: "text-rose-600",    text: "Agent Builder: workflow létrehozva",  sub: "Számla → Jóváhagyás → Export",  time: "3 órája" },
]

// ── Helpers ────────────────────────────────────────────────────
function getGreeting() {
  const h = new Date().getHours()
  if (h < 5)  return "Jó éjszakát"
  if (h < 12) return "Jó reggelt"
  if (h < 18) return "Jó napot"
  return "Jó estét"
}

function getHunDate() {
  return new Date().toLocaleDateString("hu-HU", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  })
}

// ── Page ───────────────────────────────────────────────────────
export default function DashboardPage() {
  const { modules, isEnabled, plan } = useModules()
  const { user } = useAuth()
  const navigate  = useNavigate()

  const { data: approvals } = useGet("approvals-count", "/core/approve?status=pending&limit=1")
  const pendingCount = approvals?.total ?? 0
  const activeCount  = useMemo(() => Object.values(modules).filter(Boolean).length, [modules])
  const firstName    = user?.full_name?.split(" ").pop() || user?.email?.split("@")[0] || "Admin"

  const STATS = [
    { label: "Email ma",          value: "47",           Icon: Mail,      trend: "+12%", up: true,  accent: "violet"  },
    { label: "Függő jóváhagyás",  value: pendingCount,   Icon: Clock,     trend: null,   up: false, accent: "amber"   },
    { label: "Aktív modul",       value: activeCount,    Icon: Activity,  trend: null,   up: false, accent: "blue"    },
    { label: "AI hívás / hó",     value: "1 284",        Icon: Sparkles,  trend: "+8%",  up: true,  accent: "emerald" },
  ]

  return (
    <div className="max-w-[1160px] mx-auto space-y-7">

      {/* ── Welcome bar ── */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <h1 className="text-[22px] font-semibold text-foreground tracking-tight">
            {getGreeting()}, {firstName}!
          </h1>
          <p className="text-[13px] text-muted-foreground mt-0.5 capitalize">{getHunDate()}</p>
        </div>
        <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-full capitalize">
          {plan} csomag
        </span>
      </div>

      {/* ── Quick stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {STATS.map(s => <StatCard key={s.label} {...s} />)}
      </div>

      {/* ── Module cards ── */}
      <section>
        <SectionLabel>Modulok</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {Object.entries(MODULE_INFO).map(([key, info]) => (
            <ModuleCard
              key={key}
              info={info}
              active={isEnabled(key)}
              onClick={() => isEnabled(key) && navigate(info.route)}
            />
          ))}
        </div>
      </section>

      {/* ── Activity feed ── */}
      <section className="pb-4">
        <SectionLabel>Legutóbbi tevékenység</SectionLabel>
        <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
          {ACTIVITY.map((item, i) => <ActivityRow key={i} {...item} />)}
        </div>
      </section>

    </div>
  )
}

// ── StatCard ───────────────────────────────────────────────────

const ACCENT = {
  violet:  { bg: "bg-violet-50",  border: "border-violet-100", icon: "text-violet-600" },
  amber:   { bg: "bg-amber-50",   border: "border-amber-100",  icon: "text-amber-600" },
  blue:    { bg: "bg-blue-50",    border: "border-blue-100",   icon: "text-blue-600" },
  emerald: { bg: "bg-emerald-50", border: "border-emerald-100",icon: "text-emerald-600" },
}

function StatCard({ label, value, Icon, trend, up, accent }) {
  const c = ACCENT[accent]
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3 hover:shadow-sm transition-all duration-200">
      <div className="flex items-center justify-between">
        <div className={`w-8 h-8 rounded-lg ${c.bg} border ${c.border} flex items-center justify-center`}>
          <Icon size={14} className={c.icon} />
        </div>
        {trend && (
          <span className={`flex items-center gap-0.5 text-[11px] font-medium ${up ? "text-emerald-600" : "text-red-500"}`}>
            <TrendingUp size={10} />
            {trend}
          </span>
        )}
      </div>
      <div>
        <div className="text-[22px] font-semibold text-foreground leading-none tabular-nums">{value}</div>
        <div className="text-[11px] text-muted-foreground mt-1">{label}</div>
      </div>
    </div>
  )
}

// ── ModuleCard ─────────────────────────────────────────────────

function ModuleCard({ info, active, onClick }) {
  const { Icon, label, desc, gradient } = info
  return (
    <div
      onClick={onClick}
      className={[
        "group relative bg-card border border-border rounded-xl p-5 overflow-hidden transition-all duration-200",
        active
          ? "hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-6px_rgba(0,0,0,0.08)] hover:border-border/60 cursor-pointer"
          : "opacity-50 cursor-default select-none",
      ].join(" ")}
    >
      {/* Decorative gradient orb */}
      {active && (
        <div className={`absolute -top-10 -right-10 w-32 h-32 rounded-full bg-gradient-to-br ${gradient} opacity-[0.07] group-hover:opacity-[0.13] transition-opacity duration-300 pointer-events-none`} />
      )}

      {/* Icon + badge row */}
      <div className="relative flex items-start justify-between mb-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm ${active ? `bg-gradient-to-br ${gradient}` : "bg-muted"}`}>
          {active
            ? <Icon size={17} className="text-white" strokeWidth={1.75} />
            : <Lock size={14} className="text-muted-foreground/40" />
          }
        </div>

        {active
          ? <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">Aktív</span>
          : <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground/60 bg-muted border border-border px-2 py-0.5 rounded-full">
              <Lock size={8} />Nem aktív
            </span>
        }
      </div>

      {/* Text */}
      <div className="relative">
        <h3 className="text-[14px] font-semibold text-foreground mb-1">{label}</h3>
        <p className="text-[12px] text-muted-foreground leading-relaxed">{desc}</p>
      </div>

      {/* CTA arrow */}
      {active && (
        <div className="relative mt-4 flex items-center gap-1 text-[11px] font-medium text-muted-foreground group-hover:text-foreground transition-colors duration-150">
          Megnyitás
          <ArrowUpRight size={11} className="transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </div>
      )}
    </div>
  )
}

// ── ActivityRow ────────────────────────────────────────────────

function ActivityRow({ Icon, bg, ic, text, sub, time }) {
  return (
    <div className="flex items-center gap-3.5 px-5 py-3.5 hover:bg-muted/40 transition-colors duration-100">
      <div className={`flex-shrink-0 w-8 h-8 rounded-lg ${bg} flex items-center justify-center`}>
        <Icon size={14} className={ic} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-foreground truncate">{text}</p>
        <p className="text-[11px] text-muted-foreground">{sub}</p>
      </div>
      <span className="flex-shrink-0 text-[11px] text-muted-foreground whitespace-nowrap">{time}</span>
    </div>
  )
}

// ── SectionLabel ───────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <h2 className="text-[10.5px] font-semibold text-muted-foreground/70 uppercase tracking-[.1em] mb-3">
      {children}
    </h2>
  )
}
