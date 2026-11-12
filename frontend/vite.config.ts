import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 개발 서버: http://localhost:5173
// /api, /health 요청은 백엔드(http://localhost:8000)로 넘긴다.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": "http://localhost:8000",
      "/health": "http://localhost:8000",
      "/uploads": "http://localhost:8000",
    },
  },
});
