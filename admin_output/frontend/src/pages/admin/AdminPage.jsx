/**
 * AdminPage — Central admin hub
 *
 * Tabs:
 *   - Tenants   (superadmin only)
 *   - Users     (tenant admin + superadmin)
 *   - Audit Log (tenant admin + superadmin)
 *   - Usage     (tenant admin + superadmin)
 *
 * Superadmin sees tenant selector at the top; tenant admin is always scoped to own tenant.
 */
import { useState } from "react"
import { useAuth }   from "@/core/auth/AuthContext"
import { Building2, Users, ScrollText, BarChart3, Shield } from "lucide-react"
import TenantsTab from "./tabs/TenantsTab"
import UsersTab   from "./tabs/UsersTab"
import AuditTab   from "./tabs/AuditTab"
import UsageTab   from "./tabs/UsageTab"

const TABS_SUPERADMIN = [
  { id: "tenants", label: "Tenants",   Icon: Building2  },
  { id: "users",   label: "Felhasználók", Icon: Users    },
  { id: "audit",   label: "Audit Log", Icon: ScrollText },
  { id: "usage",   label: "Használat", Icon: BarChart3  },
]

const TABS_ADMIN = [
  { id: "users",   label: "Felhasználók", Icon: Users    },
  { id: "audit",   label: "Audit Log", Icon: ScrollText },
  { id: "usage",   label: "Használat", Icon: BarChart3  },
]

export default function AdminPage() {
  const { user, tenant, isSuperadmin } = useAuth()
  const tabs = isSuperadmin ? TABS_SUPERADMIN : TABS_ADMIN
  const [activeTab, setActiveTab] = useState(tabs[0].id)

  // Superadmin: can select any tenant; tenant admin: fixed to own
  const [selectedTenantId, setSelectedTenantId] = useState(
    isSuperadmin ? null : tenant?.id
  )

  return (
    <div className="max-w-[1100px] mx-auto space-y-5">

      {/* Header */}
      <div className="pt-1 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[20px] font-semibold text-foreground tracking-tight">
              Admin
            </h1>
            {isSuperadmin && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 text-purple-700 border border-purple-200">
                <Shield size={9} />
                SUPERADMIN
              </span>
            )}
          </div>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            {isSuperadmin
              ? "Platform-szintű kezelés — minden tenant"
              : `Tenant kezelés — ${tenant?.name ?? "saját szervezet"}`}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 border-b border-border">
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={[
              "flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors duration-150",
              activeTab === id
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "tenants" && isSuperadmin && (
          <TenantsTab
            selectedTenantId={selectedTenantId}
            onSelectTenant={setSelectedTenantId}
          />
        )}
        {activeTab === "users" && (
          <UsersTab
            tenantId={selectedTenantId ?? tenant?.id}
            isSuperadmin={isSuperadmin}
            onSelectTenant={isSuperadmin ? setSelectedTenantId : undefined}
          />
        )}
        {activeTab === "audit" && (
          <AuditTab
            tenantId={isSuperadmin ? selectedTenantId : tenant?.id}
            isSuperadmin={isSuperadmin}
          />
        )}
        {activeTab === "usage" && (
          <UsageTab
            tenantId={isSuperadmin ? selectedTenantId : tenant?.id}
            isSuperadmin={isSuperadmin}
          />
        )}
      </div>

    </div>
  )
}
