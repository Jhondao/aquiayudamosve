import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Proxying /api keeps the frontend same-origin with the backend in dev,
    // so the httpOnly refresh cookie works without SameSite=None+Secure
    // gymnastics on localhost.
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
