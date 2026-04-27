/**
 * Approval Inbox — cross-module, Core page.
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
    { key: "resource_type", label: "Típus",
      render: v => <span className="capitalize text-[12px]">{v?.replace("_", " ")}</span> },
    { key: "summary",    label: "Összefoglaló" },
    { key: "confidence", label: "Pontosság",
      render: v => <ConfidenceBar value={v} /> },
    { key: "status",     label: "Állapot",
      render: v => <Badge variant={statusVariant[v] ?? "default"}>{v}</Badge> },
    { key: "actions",    label: "",
      render: (_, row) => (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary">Jóváhagy</Button>
          <Button size="sm" variant="outline">Elutasít</Button>
        </div>
      )
    },
  ]

  if (!isLoading && items.length === 0) {
    return <EmptyState icon="✓" title="Nincs jóváhagyásra váró elem" description="Minden feladat elvégzésre került." />
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[16px] font-semibold text-foreground">Jóváhagyási sor</h2>
        <span className="text-[12px] text-muted-foreground">{items.length} elem</span>
      </div>
      <DataTable columns={columns} data={items} />
    </div>
  )
}
