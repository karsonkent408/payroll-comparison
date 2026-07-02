import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), cloudflare(), tailwindcss()],
  server: {
    port: Number(process.env.PORT) || 5173,
    strictPort: true,
  },
  resolve: {
    alias: {
      "@/lib": path.resolve(__dirname, "src/shared/lib"),
      "@/components": path.resolve(__dirname, "src/shared/components"),
      "@": path.resolve(__dirname, "src"),
    },
  },
});
