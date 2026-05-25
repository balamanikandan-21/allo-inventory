// tailwind.config.ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ["IBM Plex Mono", "monospace"],
        sans: ["DM Sans", "sans-serif"],
      },
      colors: {
        bg: {
          primary: "#0d0f12",
          secondary: "#131720",
          card: "#181d27",
        },
        border: {
          DEFAULT: "#2a3040",
          subtle: "#1e2433",
        },
        amber: {
          DEFAULT: "#f59e0b",
          dim: "#92600a",
        },
      },
    },
  },
  plugins: [],
};

export default config;
