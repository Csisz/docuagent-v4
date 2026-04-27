import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { fileURLToPath, URL } from "node:url"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    historyApiFallback: true,
    port: 5173,
    proxy: {
      "/core":     { target: "http://localhost:8001", changeOrigin: true },
      "/api":      { target: "http://localhost:8001", changeOrigin: true },
      "/invoice":  { target: "http://localhost:8001", changeOrigin: true },
      "/settings": { target: "http://localhost:8001", changeOrigin: true },
      "/document": { target: "http://localhost:8001", changeOrigin: true },
      "/email":    { target: "http://localhost:8001", changeOrigin: true },
    },
  },
})