import clsx from "clsx"

const variants = {
  default:  "bg-secondary text-secondary-foreground",
  success:  "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  warning:  "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  danger:   "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  info:     "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  neutral:  "bg-muted text-muted-foreground",
}

export function Badge({ variant = "default", className, children }) {
  return (
    <span className={clsx(
      "inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium",
      variants[variant], className
    )}>
      {children}
    </span>
  )
}
