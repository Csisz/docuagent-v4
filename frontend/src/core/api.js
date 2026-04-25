/**
 * V4 API client â€” axios alapu, automatikus token kezelessel
 * Minden modul ezt hasznlja: import { api } from "@/core/api"
 */
import axios from "axios"

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "",
  timeout: 30_000,
  headers: { "Content-Type": "application/json" },
})

// Request: JWT token hozzaadasa minden kereshez
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token")
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Response: 401 -> redirect to login
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("access_token")
      window.location.href = "/login"
    }
    return Promise.reject(err)
  }
)