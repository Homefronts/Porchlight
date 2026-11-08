import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import path from "node:path";
import fs from "node:fs";

// Serves node_modules/kuromoji/dict at /kuromoji-dict/ (dev) and copies it into the build.
// No Content-Encoding on purpose: kuromoji gunzips the .dat.gz files itself.
const dictDir = path.resolve(__dirname, "node_modules/kuromoji/dict");
const kuromojiDict = () => ({
  name: "kuromoji-dict",
  configureServer(server: { middlewares: { use: (fn: (req: any, res: any, next: () => void) => void) => void } }) {
    server.middlewares.use((req, res, next) => {
      const m = /^\/kuromoji-dict\/([\w.-]+)$/.exec((req.url ?? "").split("?")[0]);
      const file = m && path.join(dictDir, m[1]);
      if (!file || !fs.existsSync(file)) return next();
      res.setHeader("Content-Type", "application/octet-stream");
      fs.createReadStream(file).pipe(res);
    });
  },
  closeBundle() {
    const out = path.resolve(__dirname, "dist/kuromoji-dict");
    fs.mkdirSync(out, { recursive: true });
    for (const f of fs.readdirSync(dictDir)) fs.copyFileSync(path.join(dictDir, f), path.join(out, f));
  },
});

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      routesDirectory: "./src/routes",
      generatedRouteTree: "./src/routeTree.gen.ts",
    }),
    react(),
    tailwindcss(),
    kuromojiDict(),
  ],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
