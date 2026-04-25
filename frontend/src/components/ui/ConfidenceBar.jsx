/**
 * Visual confidence indicator â€” replaces V3 emoji-based sentiment.
 * Shows a horizontal bar + percentage + color-coded label.
 */
import clsx from "clsx"

export function ConfidenceBar({ value, showLabel = true }) {
  const pct   = Math.round((value ?? 0) * 100)
  const color = pct >= 85 ? "bg-emerald-500"
              : pct >= 65 ? "bg-amber-400"
              : "bg-red-400"
  const label = pct >= 85 ? "Magas" : pct >= 65 ? "KĂ¶zepes" : "Alacsony"

  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={clsx("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
      {showLabel && (
        <span className="text-[11px] text-muted-foreground tabular-nums">{pct}%</span>
      )}
    </div>
  )
}
