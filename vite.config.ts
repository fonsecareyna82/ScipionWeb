// vite.config.ts
import path from "path";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";
import inject from "@rollup/plugin-inject";
import { defineConfig, type ConfigEnv, type UserConfig } from "vite";
import type { RollupLog } from "rollup";

const svgrOptions = {
  svgrOptions: {
    icon: true,
    exportType: "named" as const,
    namedExport: "ReactComponent" as const,
  },
};

export default defineConfig((env: ConfigEnv): UserConfig => {
  // decideBuildTarget
  const mode = env.mode || "app";
  const isProjects = mode === "projects";
  const isProjectPage = mode === "projectpage";
  const isProtocolDetail = mode === "protocoldetail";
  const isUmd = isProjects || isProjectPage || isProtocolDetail;

  const plugins = [react(), svgr(svgrOptions)];

  // ignoreSpecificRollupWarnings
  const onwarn = (warning: RollupLog, warn: (warning: RollupLog) => void) => {
    const warningCode = typeof warning.code === "string" ? warning.code : "";
    const warningId = typeof (warning as any).id === "string" ? (warning as any).id : "";

    const isEvalWarning =
      warningCode === "EVAL" &&
      (warningId.includes("@react-jvectormap/core") ||
        String(warning.message ?? "").includes("@react-jvectormap/core"));

    if (isEvalWarning) return;

    warn(warning);
  };

  // aliasesForBundlerAndUmdShims
  const resolve: UserConfig["resolve"] = {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "./src") },
      {
        find: "process",
        replacement: path.resolve(__dirname, "node_modules/process/browser.js"),
      },
      {
        find: "process/browser",
        replacement: path.resolve(__dirname, "node_modules/process/browser.js"),
      },
      ...(isUmd
        ? [
          {
            find: /^framer-motion(\/.*)?$/,
            replacement: path.resolve(__dirname, "./src/shims/noop-framer.ts"),
          },
          {
            find: /^react-hot-toast(\/.*)?$/,
            replacement: path.resolve(__dirname, "./src/shims/noop-toast.ts"),
          },
        ]
        : []),
    ],
  };

  const build: UserConfig["build"] = isUmd
    ? (() => {
      // determineWhichUmdEntryToBuild
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

      const jsFileName = isProjects
        ? "projects-widget.js"
        : isProjectPage
          ? "projectpage-widget.js"
          : "protocoldetail-widget.js";

      // forceOneStableCssFilePerWidgetBuild
      const cssFileName = isProjects
        ? "styles/projects-widget"
        : isProjectPage
          ? "styles/projectpage-widget"
          : "styles/protocoldetail-widget";

      return {
        outDir: "dist/umd",
        sourcemap: "hidden",
        minify: "esbuild",
        assetsInlineLimit: 100 * 1024,
        target: "es2018",
        cssCodeSplit: false,
        emptyOutDir: isProjects,
        lib: {
          entry,
          name: globalName,
          formats: ["umd"],
          fileName: () => jsFileName,
          cssFileName,
        },
        rollupOptions: {
          onwarn,
          external: [],
          output: {
            exports: "named",
            globals: {},
            chunkFileNames: "assets/[name].js",
            assetFileNames: (info) => {
              const n = info.name ?? "";
              if (/\.(png|jpe?g|svg|gif|webp)$/.test(n)) return "images/[name][extname]";
              return "assets/[name][extname]";
            },
          },
          plugins: [inject({ process: "process" })],
        },
      };
    })()
    : {
      // buildFullWebApp
      outDir: "dist/app",
      emptyOutDir: true,
      sourcemap: false,
      minify: "esbuild",
      chunkSizeWarningLimit: 11500,
      assetsInlineLimit: 100 * 1024,
      target: "es2018",
      rollupOptions: {
        onwarn,
        output: {
          chunkFileNames: "assets/[name]-[hash].js",
          assetFileNames: (info) => {
            const n = info.name ?? "";
            if (/\.(png|jpe?g|svg|gif|webp)$/.test(n)) return "images/[name]-[hash][extname]";
            return "assets/[name]-[hash][extname]";
          },
        },
        plugins: [inject({ process: "process" })],
      },
    };

  const server: UserConfig["server"] =
    env.command === "serve"
      ? {
        proxy: {
          "/api": {
            target: "http://localhost:8080",
            changeOrigin: true,
            secure: false,
          },
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
