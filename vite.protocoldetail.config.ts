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
      entry: path.resolve(__dirname, "src/entry-protocoldetail-umd.tsx"),
      name: "MyProjectsWidgetProtocolDetail", // UMD global
      formats: ["umd"],
      fileName: () => "protocoldetail-widget.js",
    },
    target: "es2018",
    cssCodeSplit: true,
    emptyOutDir: false,
    rollupOptions: {
      external: [],
      output: {
        exports: "named",
        globals: {},
        chunkFileNames: "assets/[name].[hash].js",
        assetFileNames: (info) => {
          const n = info.name ?? "";
          if (/\.(png|jpe?g|svg|gif|webp)$/.test(n)) return "images/[name].[hash][extname]";
          if (/\.css$/.test(n)) return "styles/[name].[hash][extname]";
          return "assets/[name].[hash][extname]";
        },
      },
      plugins: [inject({ process: "process" })],
    },
  },
});
