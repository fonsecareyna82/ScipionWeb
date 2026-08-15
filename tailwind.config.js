/** @type {import('tailwindcss').Config} */
const isWidgetBuild = process.env.WIDGET_BUILD === "1";

module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "../components/**/*.{js,ts,jsx,tsx}",
  ],
  important: isWidgetBuild ? ".projectpage-widget-root" : false,
  darkMode: isWidgetBuild ? ["class", ".projectpage-widget-root.dark"] : "class",
  theme: {
    extend: {},
  },
  plugins: [],
  corePlugins: {
    preflight: false,
  },
};
