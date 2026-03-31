/** @type {import('tailwindcss').Config} */
const config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "dark-nav":    "#111113",
        "dark-chat":   "#1c1c1f",
        "dark-config": "#161618",
        "dark-bubble": "#2a2a2f",
        "dark-input":  "#242428",
        "dark-border": "#2e2e33",
      },
    },
  },
  plugins: [],
};

module.exports = config;
