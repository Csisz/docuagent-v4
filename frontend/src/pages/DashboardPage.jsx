/**
 * Dashboard â€” overview cards + module status.
 * TODO: connect to /core/meter/summary and module stats.
 */
import { Card, CardHeader, CardTitle } from "@/components/ui/Card"
import { useModules } from "@/core/modules/ModuleContext"

const MODULE_INFO = {
  invoice_agent:  { label: "Invoice Agent",  desc: "SzĂˇmla feldolgozĂˇs" },
  email_agent:    { label: "Email Agent",    desc: "Email automatizĂˇlĂˇs" },
  document_agent: { label: "Document Agent", desc: "Dokumentum elemzĂ©s" },
}

export default function DashboardPage() {
  const { modules, plan } = useModules()
  const enabledList = Object.entries(modules).filter(([, v]) => v)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[22px] font-semibold text-foreground">ĂttekintĂ©s</h2>
        <p className="text-[13px] text-muted-foreground mt-0.5">
          AktĂ­v csomag: <span className="font-medium capitalize">{plan}</span>
        </p>
      </div>

      {/* Active modules */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {enabledList.length === 0 ? (
          <Card className="col-span-full">
            <p className="text-[13px] text-muted-foreground text-center py-4">
              Nincsenek aktĂ­v modulok. LĂ©pjen kapcsolatba az adminisztrĂˇtorral.
            </p>
          </Card>
        ) : (
          enabledList.map(([key]) => (
            <Card key={key} className="hover:border-blue-500/40 transition-colors cursor-pointer">
              <CardHeader>
                <CardTitle>{MODULE_INFO[key]?.label ?? key}</CardTitle>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-0.5 rounded-full font-medium">AktĂ­v</span>
              </CardHeader>
              <p className="text-[13px] text-muted-foreground">{MODULE_INFO[key]?.desc}</p>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
