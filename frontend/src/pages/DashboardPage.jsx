import { useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { useModules } from "@/core/modules/ModuleContext"
import { useAuth } from "@/core/auth/AuthContext"
import { useGet } from "@/core/hooks/useApi"
import {
  Mail, FileText, BookOpen, Users, Calendar, Zap,
  Clock, Activity, Sparkles, CheckCircle2, Lock,
  ArrowUpRight, TrendingUp, ChevronRight,
} from "lucide-react"

// ── Module registry ────────────────────────────────────────────
const MODULE_INFO = {
  email_agent:    { label: "Email Agent",   desc: "Email classification and automation", gradient: "from-violet-500 to-purple-600",  Icon: Mail,     route: "/email"    },
  invoice_agent:  { label: "Invoice Agent", desc: "Invoice processing and export",       gradient: "from-blue-500 to-indigo-600",    Icon: FileText, route: "/invoice"  },
  document_agent: { label: "Documents",     desc: "Document analysis and RAG",           gradient: "from-teal-500 to-cyan-600",      Icon: BookOpen, route: "/document" },
  crm_module:     { label: "CRM",           desc: "Contact and case management",         gradient: "from-orange-500 to-amber-600",   Icon: Users,    route: "/crm"      },
  calendar_module:{ label: "Calendar",      desc: "Google Calendar synchronization",     gradient: "from-green-500 to-emerald-600",  Icon: Calendar, route: "/calendar" },
  agent_builder:  { label: "Agent Builder", desc: "Create custom AI agents",             gradient: "from-rose-500 to-pink-600",      Icon: Zap,      route: "/agents"   },
}

// ── Activity feed data ─────────────────────────────────────────
const ACTIVITY = [
  { Icon: FileText,     bg: "bg-blue-50",    ic: "text-blue-500",    text: "INV-2024–0892 processed", sub: "Queued for export",           badge: "Review",      badgeStyle: "text-amber-600 bg-amber-50 border-amber-200",       time: "2m"  },
  { Icon: Mail,         bg: "bg-violet-50",  ic: "text-violet-500",  text: "47 emails classified",    sub: "12 priority · 8 orders",      badge: "AI Answered", badgeStyle: "text-emerald-600 bg-emerald-50 border-emerald-200", time: "15m" },
  { Icon: CheckCircle2, bg: "bg-emerald-50", ic: "text-emerald-500", text: "Approval completed",      sub: "Accounting export #2024-11",  badge: "Approved",    badgeStyle: "text-emerald-600 bg-emerald-50 border-emerald-200", time: "1h"  },
  { Icon: BookOpen,     bg: "bg-teal-50",    ic: "text-teal-500",    text: "Document uploaded",       sub: "Contract_2024_Q4.pdf",        badge: null,          badgeStyle: null,                                                time: "2h"  },
  { Icon: Zap,          bg: "bg-rose-50",    ic: "text-rose-500",    text: "Workflow triggered",      sub: "Invoice → Approval → Export", badge: "New",         badgeStyle: "text-blue-600 bg-blue-50 border-blue-200",          time: "3h"  },
]

// ── AI Status panel data ───────────────────────────────────────
const AI_STATS_ITEMS = [
  { Icon: TrendingUp, color: "text-emerald-500", text: "94.2% avg AI confidence today"   },
  { Icon: Clock,      color: "text-amber-500",   text: "3 approvals waiting for review"  },
  { Icon: FileText,   color: "text-blue-500",    text: "2 invoices ready for export"     },
  { Icon: Mail,       color: "text-red-400",     text: "1 email needs urgent reply"      },
]

const URGENT_ACTIONS = [
  { title: "Review INV-2024-0892", sub: "94% confidence · ACME Corp"          },
  { title: "Reply to EMAIL-0044",  sub: "Customer complaint · High priority"  },
  { title: "Export 2 invoices",    sub: "Verified and ready"                  },
]

// ── Helpers ────────────────────────────────────────────────────
function getGreeting() {
  const h = new Date().getHours()
  if (h < 5)  return "Good night"
  if (h < 12) return "Good morning"
  if (h < 18) return "Good afternoon"
  return "Good evening"
}

function getEnDate() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  })
}

// ── Page ───────────────────────────────────────────────────────
export default function DashboardPage() {
  const { modules, isEnabled, plan } = useModules()
  const { user } = useAuth()
  const navigate = useNavigate()

  const { data: approvals } = useGet("approvals-count", "/core/approve?status=pending&limit=1")
  const pendingCount = approvals?.total ?? 0
  const activeCount  = useMemo(() => Object.values(modules).filter(Boolean).length, [modules])
  const displayName  = user?.full_name || user?.email?.split("@")[0] || "Admin"

  const STATS = [
    { label: "Emails today",      value: "47",         Icon: Mail,     trend: "+12%",    trendType: "up",   accent: "blue"   },
    { label: "Pending approvals", value: pendingCount, Icon: Clock,    trend: "Requires", trendType: "warn", accent: "amber"  },
    { label: "Active modules",    value: activeCount,  Icon: Activity, trend: null,       trendType: null,   accent: "green"  },
    { label: "AI calls / month",  value: "1,284",      Icon: Sparkles, trend: "+8%",      trendType: "up",   accent: "purple" },
  ]

  return (
    <div className="max-w-[1200px] mx-auto space-y-6">

      {/* ── Welcome bar ── */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <h1 className="text-[22px] font-semibold text-foreground tracking-tight">
            {getGreeting()}, {displayName}
          </h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">{getEnDate()}</p>
        </div>
        <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-full uppercase tracking-wide">
          {plan} Plan
        </span>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STATS.map(s => <StatCard key={s.label} {...s} />)}
      </div>

      {/* ── Activity + AI Status ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-3">
          <SectionLabel>Recent Activity</SectionLabel>
          <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
            {ACTIVITY.map((item, i) => <ActivityRow key={i} {...item} />)}
          </div>
        </div>
        <div className="space-y-3">
          <SectionLabel>AI Status</SectionLabel>
          <AIStatusPanel />
        </div>
      </div>

      {/* ── Modules ── */}
      <section className="pb-4 space-y-3">
        <SectionLabel>Modules</SectionLabel>
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

    </div>
  )
}

// ── StatCard ───────────────────────────────────────────────────
const ACCENT = {
  blue:   { iconBg: "bg-blue-100",   iconColor: "text-blue-600"   },
  amber:  { iconBg: "bg-amber-100",  iconColor: "text-amber-600"  },
  green:  { iconBg: "bg-green-100",  iconColor: "text-green-600"  },
  purple: { iconBg: "bg-purple-100", iconColor: "text-purple-600" },
}

function StatCard({ label, value, Icon, trend, trendType, accent }) {
  const { iconBg, iconColor } = ACCENT[accent]
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3 hover:shadow-card transition-shadow duration-200">
      <div className="flex items-center justify-between">
        <div className={`w-9 h-9 rounded-lg ${iconBg} flex items-center justify-center`}>
          <Icon size={16} className={iconColor} />
        </div>
        {trendType === "up" && (
          <span className="flex items-center gap-0.5 text-[11px] font-medium text-emerald-600">
            <TrendingUp size={10} />{trend}
          </span>
        )}
        {trendType === "warn" && (
          <span className="text-[11px] font-medium text-amber-500">
            ↝ {trend}
          </span>
        )}
      </div>
      <div>
        <div className="text-[26px] font-semibold text-foreground leading-none tabular-nums">{value}</div>
        <div className="text-[12px] text-muted-foreground mt-1">{label}</div>
      </div>
    </div>
  )
}

// ── ActivityRow ────────────────────────────────────────────────
function ActivityRow({ Icon, bg, ic, text, sub, badge, badgeStyle, time }) {
  return (
    <div className="flex items-center gap-3.5 px-5 py-3.5 hover:bg-muted/40 transition-colors duration-100">
      <div className={`flex-shrink-0 w-8 h-8 rounded-lg ${bg} flex items-center justify-center`}>
        <Icon size={14} className={ic} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-foreground truncate">{text}</p>
        <p className="text-[11px] text-muted-foreground">{sub}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {badge && (
          <span className={`text-[10px] font-medium border px-2 py-0.5 rounded-full whitespace-nowrap ${badgeStyle}`}>
            {badge}
          </span>
        )}
        <span className="text-[11px] text-muted-foreground/60 w-7 text-right">{time}</span>
      </div>
    </div>
  )
}

// ── AIStatusPanel ──────────────────────────────────────────────
function AIStatusPanel() {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="p-4 border-b border-border">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
            <Sparkles size={14} className="text-purple-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold text-foreground">AI Engine · Live</span>
              <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full whitespace-nowrap">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full inline-block" />
                Online
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Processing normally</p>
          </div>
        </div>
        <div className="space-y-2.5">
          {AI_STATS_ITEMS.map((stat, i) => (
            <div key={i} className="flex items-center gap-2">
              <stat.Icon size={12} className={`flex-shrink-0 ${stat.color}`} />
              <span className="text-[12px] text-muted-foreground">{stat.text}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="p-4">
        <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-3">
          Urgent Actions
        </p>
        <div className="space-y-1">
          {URGENT_ACTIONS.map((action, i) => (
            <button key={i} className="w-full flex items-center justify-between p-2.5 rounded-lg text-left hover:bg-muted/50 transition-colors group">
              <div>
                <p className="text-[12px] font-medium text-foreground">{action.title}</p>
                <p className="text-[11px] text-muted-foreground">{action.sub}</p>
              </div>
              <ChevronRight size={13} className="text-muted-foreground/30 group-hover:text-muted-foreground/60 flex-shrink-0 transition-colors" />
            </button>
          ))}
        </div>
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
          ? "hover:-translate-y-0.5 hover:shadow-panel hover:border-border/60 cursor-pointer"
          : "opacity-50 cursor-default select-none",
      ].join(" ")}
    >
      {active && (
        <div className={`absolute -top-10 -right-10 w-32 h-32 rounded-full bg-gradient-to-br ${gradient} opacity-[0.07] group-hover:opacity-[0.13] transition-opacity duration-300 pointer-events-none`} />
      )}
      <div className="relative flex items-start justify-between mb-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm ${active ? `bg-gradient-to-br ${gradient}` : "bg-muted"}`}>
          {active
            ? <Icon size={17} className="text-white" strokeWidth={1.75} />
            : <Lock size={14} className="text-muted-foreground/40" />
          }
        </div>
        {active
          ? <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">Active</span>
          : <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground/60 bg-muted border border-border px-2 py-0.5 rounded-full">
              <Lock size={8} />Inactive
            </span>
        }
      </div>
      <div className="relative">
        <h3 className="text-[14px] font-semibold text-foreground mb-1">{label}</h3>
        <p className="text-[12px] text-muted-foreground leading-relaxed">{desc}</p>
      </div>
      {active && (
        <div className="relative mt-4 flex items-center gap-1 text-[11px] font-medium text-muted-foreground group-hover:text-foreground transition-colors duration-150">
          Open
          <ArrowUpRight size={11} className="transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </div>
      )}
    </div>
  )
}

// ── SectionLabel ───────────────────────────────────────────────
function SectionLabel({ children }) {
  return (
    <h2 className="text-[10.5px] font-semibold text-muted-foreground/70 uppercase tracking-[.1em]">
      {children}
    </h2>
  )
}
