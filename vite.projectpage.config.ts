import path from "path";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";
import inject from "@rollup/plugin-inject";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), svgr({ svgrOptions: { icon: true, exportType: "named", namedExport: "ReactComponent" } })],
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "./src") },
      { find: "process", replacement: path.resolve(__dirname, "node_modules/process/browser.js") },
      { find: "process/browser", replacement: path.resolve(__dirname, "node_modules/process/browser.js") },
      { find: /^framer-motion(\/.*)?$/, replacement: path.resolve(__dirname, "./src/shims/noop-framer.ts") },
      { find: /^react-hot-toast(\/.*)?$/, replacement: path.resolve(__dirname, "./src/shims/noop-toast.ts") },
    ],
  },
  build: {
    outDir: "dist/umd",
    sourcemap: "hidden",
    minify: "esbuild",
    assetsInlineLimit: 100 * 1024,
    lib: {
      entry: path.resolve(__dirname, "src/entry-projectpage-umd.tsx"), // <-- project page
      name: "MyProjectsWidgetPage",                                     // <-- global ÚNICO
      formats: ["umd"],
      fileName: () => "projectpage-widget.js",
    },
    target: "es2018",
    cssCodeSplit: false,
    emptyOutDir: false,
    rollupOptions: {
      external: [],
      output: {
        assetFileNames: (assetInfo) => {
        if (assetInfo.name?.endsWith(".css")) return "projectpage-widget.css";
        return "assets/[name]-[hash][extname]";
      },
      },
      plugins: [inject({ process: "process" })],
    },
  },
});
