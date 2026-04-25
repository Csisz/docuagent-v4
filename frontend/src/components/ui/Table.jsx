/**
 * Generic sortable table.
 * Usage: <DataTable columns={[...]} data={[...]} />
 */
import clsx from "clsx"

export function DataTable({ columns, data, onRowClick, emptyText = "Nincs talĂˇlat" }) {
  if (!data?.length) {
    return (
      <div className="flex items-center justify-center h-32 text-[13px] text-muted-foreground">
        {emptyText}
      </div>
    )
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            {columns.map(col => (
              <th key={col.key}
                className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={row.id ?? i}
              onClick={() => onRowClick?.(row)}
              className={clsx(
                "border-b border-border/50 last:border-0 transition-colors",
                onRowClick && "cursor-pointer hover:bg-muted/40"
              )}>
              {columns.map(col => (
                <td key={col.key} className="px-4 py-3 align-middle">
                  {col.render ? col.render(row[col.key], row) : (row[col.key] ?? "â€”")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
