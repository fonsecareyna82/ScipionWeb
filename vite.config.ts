// vite.config.ts
import path from "path";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";
import inject from "@rollup/plugin-inject";
import { defineConfig, type ConfigEnv, type UserConfig } from "vite";

const svgrOptions = {
  svgrOptions: {
    icon: true,
    exportType: "named" as const,
    namedExport: "ReactComponent" as const,
  },
};

export default defineConfig((env: ConfigEnv): UserConfig => {
  // determineWhichUmdEntryToBuild
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

  const plugins = [react(), svgr(svgrOptions)];

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

  const build: UserConfig["build"] = {
    outDir: "dist/umd",
    sourcemap: "hidden",
    minify: "esbuild",
    assetsInlineLimit: 100 * 1024,
    target: "es2018",

    // keepSingleCssPerUmdBundle
    cssCodeSplit: false,

    // cleanOnlyOnFirstBundleIfYouChainBuilds
    emptyOutDir: isProjects,

    lib: {
      entry,
      name: globalName,
      formats: ["umd"],
      fileName: () => jsFileName,
      cssFileName, // outputs dist/umd/styles/<name>.css
    },

    rollupOptions: {
      external: [],
      output: {
        exports: "named",
        globals: {},
        chunkFileNames: "assets/[name].[hash].js",
        assetFileNames: (info) => {
          const n = info.name ?? "";
          if (/\.(png|jpe?g|svg|gif|webp)$/.test(n)) return "images/[name].[hash][extname]";
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
