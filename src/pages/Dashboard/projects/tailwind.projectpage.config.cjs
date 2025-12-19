// tailwind.projectpage.config.cjs
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  important: ".projectpage-widget-root",
  content: [
    "./src/entry-projectpage-umd.tsx",
    "./src/pages/Dashboard/projects/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/services/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
