// vite.config.ts
import path from "path";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";
import inject from "@rollup/plugin-inject";
import { defineConfig, type ConfigEnv } from "vite";

const entry = path.resolve(__dirname, "src/entry-umd.tsx");
const globalName = "MyProjectsWidget";

const svgrOptions = {
  svgrOptions: {
    icon: true,
    exportType: "named" as const,
    namedExport: "ReactComponent" as const,
  },
};

export default defineConfig((env: ConfigEnv) => {
  const isServe = env.command === "serve";
  const mode = env.mode || "standalone";
  const isPeer = mode === "peer";
  const isDebug = mode === "debug-umd";              // debug UMD (no minify + inline sourcemap)
  const isUmd = mode === "standalone" || isDebug;    // UMD builds that run inside a host page

  /** Plugins */
  const plugins = [react(), svgr(svgrOptions)];

  /** Resolve aliases
   *  - Use array style to support RegExp 'find'
   *  - Provide 'process' browser shim for libraries referencing it in UMD
   *  - Replace framer-motion and react-hot-toast with no-op shims in UMD builds
   */
  const resolve = {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "./src") },
      { find: "process", replacement: path.resolve(__dirname, "node_modules/process/browser.js") },
      { find: "process/browser", replacement: path.resolve(__dirname, "node_modules/process/browser.js") },

      // No-op framer-motion for any subpath in UMD builds
      ...(isUmd
        ? [
            {
              find: /^framer-motion(\/.*)?$/,
              replacement: path.resolve(__dirname, "./src/shims/noop-framer.ts"),
            },
          ]
        : []),

      // No-op react-hot-toast for any subpath in UMD builds
      ...(isUmd
        ? [
            {
              find: /^react-hot-toast(\/.*)?$/,
              replacement: path.resolve(__dirname, "./src/shims/noop-toast.ts"),
            },
          ]
        : []),
    ],
  };

  /** Dev server only */
  if (isServe) {
    return {
      plugins,
      resolve,
      server: {
        proxy: {
          "/uploads": {
            target: "https://scipion.i2pc.es",
            changeOrigin: true,
            secure: true,
            rewrite: (p: string) => p.replace(/^\/uploads/, "/uploads"),
          },
        },
      },
    };
  }

  /** Build configuration (UMD) */
  return {
    plugins,
    resolve,
    build: {
      outDir: isDebug ? "dist/umd-debug" : "dist/umd",
      // Inline sourcemap in debug for one-file troubleshooting; hidden in normal UMD
      sourcemap: isDebug ? "inline" : "hidden",
      minify: isDebug ? false : "esbuild",
      assetsInlineLimit: 100 * 1024,

      lib: {
        entry,
        name: globalName,
        formats: ["umd"],
        fileName: (_format, entryName) => (isPeer ? `${entryName}.peer.js` : `${entryName}.js`),
      },

      target: "es2018",
      cssCodeSplit: true,
      // Do not wipe dist when building peer or debug side-by-side
      emptyOutDir: !isPeer && !isDebug,

      define: {
        "process.env.NODE_ENV": JSON.stringify(isDebug ? "development" : (process.env.NODE_ENV ?? "production")),
      },

      rollupOptions: {
        // In peer mode, React is provided by the host
        external: isPeer ? ["react", "react-dom"] : [],

        onwarn: (warning: any, warn: any) => {
          // Filter out known safe warnings (e.g., eval in jvectormap)
          try {
            if (
              warning &&
              (warning.code === "EVAL" || String(warning.message ?? "").includes("Use of eval")) &&
              typeof warning.id === "string" &&
              warning.id.includes("@react-jvectormap/core")
            ) {
              return;
            }
          } catch {
            /* ignore */
          }
          warn(warning);
        },

        output: {
          entryFileNames: (chunk: any) => (isPeer ? `${chunk.name}.peer.js` : `${chunk.name}.js`),
          chunkFileNames: "assets/[name].[hash].js",
          assetFileNames: (assetInfo: any) => {
            const name = assetInfo.name ?? "";
            if (/\.(png|jpe?g|svg|gif|webp)$/.test(name)) return "images/[name].[hash][extname]";
            if (/\.css$/.test(name)) return "styles/[name].[hash][extname]";
            return "assets/[name].[hash][extname]";
          },
          globals: isPeer ? { react: "React", "react-dom": "ReactDOM" } : undefined,
          // Use named-only exports to avoid "default + named" warning in UMD
          exports: "named",
        },

        // Provide 'process' global
        plugins: [inject({ process: "process" })],
      },
    },
  };
});
