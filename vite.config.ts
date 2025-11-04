// vite.config.ts
// Single config that builds one UMD bundle depending on --mode:
//   - projects       -> dist/umd/projects-widget.js        (global: MyProjectsWidgetList)
//   - projectpage    -> dist/umd/projectpage-widget.js     (global: MyProjectsWidgetPage)
//   - protocoldetail -> dist/umd/protocoldetail-widget.js  (global: MyProjectsWidgetProtocolDetail)
//
// Run:
//   npm run build:widget:list        -> vite build --mode projects
//   npm run build:widget:page        -> vite build --mode projectpage
//   npm run build:widget:protocoldetail -> vite build --mode protocoldetail
//   npm run build:widgets            -> build the sequence you prefer

import path from "path";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";
import inject from "@rollup/plugin-inject";
import { defineConfig, type ConfigEnv, type UserConfig } from "vite";

const svgrOptions = {
  svgrOptions: { icon: true, exportType: "named" as const, namedExport: "ReactComponent" as const },
};

export default defineConfig((env: ConfigEnv): UserConfig => {
  // Determine which UMD entry to build
  const mode = env.mode || "projects";
  const isProjects = mode === "projects";
  const isProjectPage = mode === "projectpage";
  const isProtocolDetail = mode === "protocoldetail";
  const isUmd = isProjects || isProjectPage || isProtocolDetail;

  const entry = isProjects
    ? path.resolve(__dirname, "src/entry-umd.tsx")
    : isProjectPage
    ? path.resolve(__dirname, "src/entry-projectpage-umd.tsx")
    : path.resolve(__dirname, "src/entry-protocoldetail-umd.tsx");

  const globalName = isProjects
    ? "MyProjectsWidgetList"
    : isProjectPage
    ? "MyProjectsWidgetPage"
    : "MyProjectsWidgetProtocolDetail";

  const fileName = isProjects
    ? "projects-widget.js"
    : isProjectPage
    ? "projectpage-widget.js"
    : "protocoldetail-widget.js";

  const plugins = [react(), svgr(svgrOptions)];

  // Aliases:
  // - Always: "@/..." and "process" browser shim
  // - Only in UMD builds: no-op shims for framer-motion and react-hot-toast
  const resolve = {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "./src") },
      { find: "process", replacement: path.resolve(__dirname, "node_modules/process/browser.js") },
      { find: "process/browser", replacement: path.resolve(__dirname, "node_modules/process/browser.js") },
      ...(isUmd
        ? [
            { find: /^framer-motion(\/.*)?$/, replacement: path.resolve(__dirname, "./src/shims/noop-framer.ts") },
            { find: /^react-hot-toast(\/.*)?$/, replacement: path.resolve(__dirname, "./src/shims/noop-toast.ts") },
          ]
        : []),
    ],
  };

  const build: UserConfig["build"] = {
    outDir: "dist/umd",
    sourcemap: "hidden",
    minify: "esbuild",
    assetsInlineLimit: 100 * 1024,
    target: "es2018",
    cssCodeSplit: true,
    // Clean only on the first bundle if you chain both builds in scripts
    emptyOutDir: isProjects,
    lib: {
      entry,
      name: globalName, // Global variable name for UMD
      formats: ["umd"],
      fileName: () => fileName,
    },
    rollupOptions: {
      external: [], // Pack everything (standalone UMD). Set ["react","react-dom"] if you want peer mode.
      output: {
        exports: "named",
        globals: {}, // Needed only if you externalize libs
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
  };

  const server: UserConfig["server"] =
    env.command === "serve"
      ? {
          proxy: {
            "/uploads": {
              target: "https://scipion.i2pc.es",
              changeOrigin: true,
              secure: true,
              rewrite: (p: string) => p.replace(/^\/uploads/, "/uploads"),
            },
          },
        }
      : undefined;

  return {
    plugins,
    resolve,
    build,
    server,
    define: {
      "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV ?? "production"),
    },
  };
});
