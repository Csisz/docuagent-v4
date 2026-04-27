import clsx from "clsx"

export function Card({ className, children, ...props }) {
  return (
    <div className={clsx(
      "bg-card border border-border rounded-xl p-5",
      className
    )} {...props}>
      {children}
    </div>
  )
}

export function CardHeader({ className, children }) {
  return <div className={clsx("flex items-center justify-between mb-4", className)}>{children}</div>
}

export function CardTitle({ className, children }) {
  return <h3 className={clsx("text-[14px] font-semibold text-foreground", className)}>{children}</h3>
}
