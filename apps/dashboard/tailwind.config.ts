import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./context/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#07121c",
        panel: "#0f2233",
        panelSoft: "#152c40",
        accent: "#3eb6ff",
        warn: "#ff9f40",
        ok: "#56d364",
        err: "#ff6b6b",
      },
      boxShadow: {
        orb: "0 0 64px rgba(62, 182, 255, 0.35)",
      },
      animation: {
        shimmer: "shimmer 2.4s linear infinite",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "0% 50%" },
          "100%": { backgroundPosition: "200% 50%" },
        },
      },
    },
  },
  plugins: [],
};

export default config;



