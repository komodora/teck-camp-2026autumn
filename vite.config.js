import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { accessLogApiPlugin } from "./server/apiPlugin.js";

export default defineConfig(({ mode }) => {
  // VITE_ プレフィックスなしの変数(ANTHROPIC_API_KEY)も含めて .env を読み込み、
  // 同一 Node プロセスで動くミドルウェア(server/chat)から process.env で参照できるようにする。
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));

  return {
    plugins: [react(), accessLogApiPlugin()],
    optimizeDeps: {
      // 事前バンドルすると worker の URL が deps 配下になり、地球儀のタイル処理が起動しない。
      exclude: ["maplibre-gl"],
    },
  };
});
