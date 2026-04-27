export function EmptyState({ icon = "◈", title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-4xl text-muted-foreground/30 mb-4">{icon}</div>
      <h3 className="text-[15px] font-semibold text-foreground mb-1">{title}</h3>
      {description && <p className="text-[13px] text-muted-foreground mb-5 max-w-xs">{description}</p>}
      {action}
    </div>
  )
}
