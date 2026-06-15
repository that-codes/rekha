/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        rekha: {
          bg: "#0b0e14",
          panel: "#141a24",
          border: "#222b38",
          accent: "#34d399",
        },
      },
    },
  },
  plugins: [],
};
