function pickPayload(response) {
  return response?.data ?? response ?? {}
}

export function normalizeListResponse(response) {
  const root = pickPayload(response)
  const nested = root?.data ?? {}
  const items =
    (Array.isArray(root) && root) ||
    (Array.isArray(root?.items) && root.items) ||
    (Array.isArray(root?.emails) && root.emails) ||
    (Array.isArray(nested?.items) && nested.items) ||
    (Array.isArray(nested?.emails) && nested.emails) ||
    []

  const total = root?.total ?? nested?.total ?? items.length
  const perPage = root?.per_page ?? nested?.per_page ?? items.length

  return {
    items,
    total,
    page: root?.page ?? nested?.page ?? 1,
    per_page: perPage,
    pages: root?.pages ?? nested?.pages ?? (perPage > 0 ? Math.ceil(total / perPage) : 1),
  }
}

export function normalizeEmailResponse(response) {
  if (response == null) return null
  const root = pickPayload(response)
  if (root?.success && root?.data) return root.data
  return root?.email ?? root
}

export function normalizeReplyResponse(response) {
  const root = pickPayload(response)
  const nested = root?.data ?? {}
  return (
    root?.reply ??
    nested?.reply ??
    root?.ai_response ??
    nested?.ai_response ??
    ""
  )
}

export function parseAiDecision(value) {
  if (!value) return null
  if (typeof value === "object") return value
  if (typeof value !== "string") return null
  try {
    return JSON.parse(value)
  } catch (err) {
    console.error("Invalid ai_decision JSON", err)
    return { raw: value }
  }
}

export function getApiErrorMessage(err, fallback = "Ismeretlen hiba történt") {
  const detail = err?.response?.data?.detail
  if (typeof detail === "string") return detail
  if (detail?.message) return detail.message
  if (err?.response?.data?.message) return err.response.data.message
  if (err?.message) return err.message
  return fallback
}
