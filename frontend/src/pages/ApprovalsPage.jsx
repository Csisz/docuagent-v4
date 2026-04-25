/**
 * Approval Inbox â€” cross-module, Core page.
 * Shows all pending approval_requests regardless of module.
 * TODO: connect to /core/approve?status=pending
 */
import { DataTable }     from "@/components/ui/Table"
import { Badge }         from "@/components/ui/Badge"
import { ConfidenceBar } from "@/components/ui/ConfidenceBar"
import { Button }        from "@/components/ui/Button"
import { EmptyState }    from "@/components/ui/EmptyState"
import { useGet }        from "@/core/hooks/useApi"

const statusVariant = { pending: "warning", approved: "success", rejected: "danger" }

export default function ApprovalsPage() {
  const { data, isLoading } = useGet("approvals", "/core/approve?status=pending")
  const items = data?.items ?? []

  const columns = [
    { key: "resource_type", label: "TĂ­pus",
      render: v => <span className="capitalize text-[12px]">{v?.replace("_", " ")}</span> },
    { key: "summary",    label: "Ă–sszefoglalĂł" },
    { key: "confidence", label: "PontossĂˇg",
      render: v => <ConfidenceBar value={v} /> },
    { key: "status",     label: "Ăllapot",
      render: v => <Badge variant={statusVariant[v] ?? "default"}>{v}</Badge> },
    { key: "actions",    label: "",
      render: (_, row) => (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary">JĂłvĂˇhagy</Button>
          <Button size="sm" variant="outline">ElutasĂ­t</Button>
        </div>
      )
    },
  ]

  if (!isLoading && items.length === 0) {
    return <EmptyState icon="âś“" title="Nincs jĂłvĂˇhagyĂˇsra vĂˇrĂł elem" description="Minden feladat elvĂ©gzĂ©sre kerĂĽlt." />
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[16px] font-semibold text-foreground">JĂłvĂˇhagyĂˇsi sor</h2>
        <span className="text-[12px] text-muted-foreground">{items.length} elem</span>
      </div>
      <DataTable columns={columns} data={items} />
    </div>
  )
}
