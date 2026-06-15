import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const target = process.env.REKHA_DEV_API ?? "http://127.0.0.1:9700";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target, changeOrigin: true },
      "/ws": { target, ws: true, changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
