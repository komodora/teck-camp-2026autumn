import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { accessLogApiPlugin } from "./server/apiPlugin.js";

export default defineConfig({
  plugins: [react(), accessLogApiPlugin()],
  optimizeDeps: {
    // 事前バンドルすると worker の URL が deps 配下になり、地球儀のタイル処理が起動しない。
    exclude: ["maplibre-gl"],
  },
});
