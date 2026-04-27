/**
 * Thin wrappers around react-query for common patterns.
 * Keeps component code clean.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/core/api"

export function useGet(key, url, options = {}) {
  return useQuery({
    queryKey: Array.isArray(key) ? key : [key],
    queryFn: () => api.get(url).then(r => r.data),
    ...options,
  })
}

export function usePost(url, options = {}) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post(url, data).then(r => r.data),
    onSuccess: () => {
      if (options.invalidates) {
        options.invalidates.forEach(k => qc.invalidateQueries({ queryKey: [k] }))
      }
    },
    ...options,
  })
}
