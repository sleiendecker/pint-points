import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Same-origin /api calls in dev get forwarded to the Hono server,
    // so the browser never deals with CORS.
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
});
