/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#0B0E0C",
          800: "#10140F",
          700: "#151B13",
          600: "#1C231A",
          500: "#252E21",
        },
        line: {
          DEFAULT: "#242C21",
          soft: "#192017",
        },
        paper: "#E9EFE6",
        dim: "#8B9486",
        faint: "#596253",
        phosphor: {
          DEFAULT: "#C8F542",
          dim: "#93B833",
          dark: "#161F0C",
        },
        amber: {
          DEFAULT: "#FFB020",
          dark: "#241A08",
        },
        danger: "#FE4C61",
      },
      fontFamily: {
        mono: ['"Space Mono"', "ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
        sans: ['"Noto Sans SC"', "system-ui", "-apple-system", "sans-serif"],
      },
      keyframes: {
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        blink: {
          "0%, 49%": { opacity: "1" },
          "50%, 100%": { opacity: "0" },
        },
        cellIn: {
          "0%": { opacity: "0", transform: "scale(0.4)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        fadeUp: "fadeUp 0.55s cubic-bezier(0.22, 1, 0.36, 1) both",
        blink: "blink 1.1s step-end infinite",
        cellIn: "cellIn 0.3s ease-out both",
      },
    },
  },
  plugins: [],
};
