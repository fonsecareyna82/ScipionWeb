/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "../components/**/*.{js,ts,jsx,tsx}",
  ],
  important: ".projectpage-widget-root",
  darkMode: ["class", ".projectpage-widget-root.dark"],
  theme: {
    extend: {},
  },
  plugins: [],
  // If you ever enable Tailwind preflight via @tailwind base / @import base,
  // keep it disabled to avoid leaking resets into the host page.
  corePlugins: {
    preflight: false,
  },
};
