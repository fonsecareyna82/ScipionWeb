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

  const commonResolve = {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      process: path.resolve(__dirname, "node_modules/process/browser.js"),
      "process/browser": path.resolve(__dirname, "node_modules/process/browser.js"),
    },
  };

  const commonPlugins = [react(), svgr(svgrOptions)];

  if (isServe) {
    return {
      plugins: commonPlugins,
      resolve: commonResolve,
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

  return {
    plugins: commonPlugins,
    resolve: commonResolve,
    build: {
      outDir: "dist/umd",
      sourcemap: "hidden",
      minify: "esbuild",
      assetsInlineLimit: 100 * 1024,
      lib: {
        entry,
        name: globalName,
        formats: ["umd"],
        fileName: (_format, entryName) =>
          isPeer ? `${entryName}.peer.js` : `${entryName}.js`,
      },
      target: "es2018",
      cssCodeSplit: true,
      emptyOutDir: !isPeer,
      define: {
        "process.env.NODE_ENV": JSON.stringify(
          process.env.NODE_ENV ?? "production"
        ),
      },
      rollupOptions: {
        external: isPeer ? ["react", "react-dom"] : [],
        onwarn: (warning: any, warn: any) => {
          try {
            if (
              warning &&
              (warning.code === "EVAL" ||
                String(warning.message ?? "").includes("Use of eval")) &&
              typeof warning.id === "string" &&
              warning.id.includes("@react-jvectormap/core")
            ) {
              return;
            }
          } catch {
            // ignore parsing failures
          }
          warn(warning);
        },
        output: {
          entryFileNames: (chunk: any) =>
            isPeer ? `${chunk.name}.peer.js` : `${chunk.name}.js`,
          chunkFileNames: "assets/[name].[hash].js",
          assetFileNames: (assetInfo: any) => {
            const name = assetInfo.name ?? "";
            if (/\.(png|jpe?g|svg|gif|webp)$/.test(name))
              return "images/[name].[hash][extname]";
            if (/\.css$/.test(name))
              return "styles/[name].[hash][extname]";
            return "assets/[name].[hash][extname]";
          },
          globals: isPeer
            ? { react: "React", "react-dom": "ReactDOM" }
            : undefined,
        },
        plugins: [inject({ process: "process" })],
      },
    },
  };
});
