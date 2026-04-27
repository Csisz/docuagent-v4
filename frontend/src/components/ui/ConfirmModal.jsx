import { useEffect } from "react"

export function ConfirmModal({
  isOpen,
  onConfirm,
  onCancel,
  title = "Megerősítés",
  message,
  confirmLabel = "Törlés",
  confirmVariant = "danger",
  icon = "🗑",
}) {
  useEffect(() => {
    if (!isOpen) return
    const handler = (e) => { if (e.key === "Escape") onCancel() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [isOpen, onCancel])

  if (!isOpen) return null

  const confirmColors = confirmVariant === "danger"
    ? { bg: "#dc2626", hover: "#b91c1c" }
    : { bg: "#2563eb", hover: "#1d4ed8" }

  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.4)",
        display: "flex", alignItems: "center", justifyContent: "center",
        animation: "cmFadeIn 0.15s ease",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "white",
          borderRadius: 16,
          padding: "28px 32px",
          width: "100%",
          maxWidth: 400,
          boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
          animation: "cmSlideUp 0.2s ease",
        }}
      >
        <div style={{
          width: 52, height: 52,
          borderRadius: 12,
          background: confirmVariant === "danger" ? "#fef2f2" : "#eff6ff",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 24, marginBottom: 16,
        }}>
          {icon}
        </div>

        <h3 style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 600, color: "#111827" }}>
          {title}
        </h3>

        <p style={{ margin: "0 0 24px", fontSize: 14, color: "#6b7280", lineHeight: 1.6 }}>
          {message}
        </p>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            style={{
              padding: "9px 18px", borderRadius: 8,
              border: "1px solid #e5e7eb", background: "white",
              fontSize: 14, fontWeight: 500, color: "#374151", cursor: "pointer",
            }}
            onMouseEnter={e => e.currentTarget.style.background = "#f9fafb"}
            onMouseLeave={e => e.currentTarget.style.background = "white"}
          >
            Mégse
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: "9px 18px", borderRadius: 8,
              border: "none", background: confirmColors.bg,
              fontSize: 14, fontWeight: 500, color: "white", cursor: "pointer",
            }}
            onMouseEnter={e => e.currentTarget.style.background = confirmColors.hover}
            onMouseLeave={e => e.currentTarget.style.background = confirmColors.bg}
          >
            {confirmLabel}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes cmFadeIn  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes cmSlideUp { from { transform: translateY(12px); opacity: 0 }
                               to   { transform: translateY(0);    opacity: 1 } }
      `}</style>
    </div>
  )
}
