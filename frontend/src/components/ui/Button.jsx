import clsx from "clsx"

const variants = {
  primary:  "bg-blue-600 hover:bg-blue-700 text-white",
  secondary:"bg-secondary hover:bg-secondary/80 text-secondary-foreground",
  ghost:    "hover:bg-accent text-foreground",
  danger:   "bg-red-600 hover:bg-red-700 text-white",
  outline:  "border border-border hover:bg-accent text-foreground",
}

const sizes = {
  sm:   "h-7 px-3 text-[12px]",
  md:   "h-9 px-4 text-[13px]",
  lg:   "h-10 px-5 text-[14px]",
  icon: "h-8 w-8",
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  disabled,
  loading,
  children,
  ...props
}) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 disabled:cursor-not-allowed",
        variants[variant], sizes[size], className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />}
      {children}
    </button>
  )
}
