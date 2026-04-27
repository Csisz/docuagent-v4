/**
 * V4 API client - axios, automatikus token kezelessel
 * Hasznalat: import { api } from "@/core/api"
 */
import axios from "axios"

const BASE = import.meta.env.VITE_API_URL ?? ""

export const api = axios.create({
  baseURL: BASE,
  timeout: 30_000,
  headers: { "Content-Type": "application/json" },
})

// JWT token hozzaadasa minden kereshez
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token")
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// 401 -> redirect to login
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