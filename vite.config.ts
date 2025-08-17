import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    svgr({
      svgrOptions: {
        icon: true,
        exportType: "named",
        namedExport: "ReactComponent",
      },
    }),
  ],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  server: {
    // Proxy para peticiones a /uploads → https://scipion.i2pc.es/uploads
    proxy: {
      "/uploads": {
        target: "https://scipion.i2pc.es",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/uploads/, "/uploads"),
      },
    },
  },
});
