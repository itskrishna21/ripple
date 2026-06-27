import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "rgba(255,255,255,0.08)",
        input: "rgba(255,255,255,0.06)",
        ring: "rgba(255,255,255,0.2)",
        background: "#09090b",
        foreground: "#fafafa",
        card: {
          DEFAULT: "#0f0f11",
          foreground: "#fafafa",
        },
        popover: {
          DEFAULT: "#0f0f11",
          foreground: "#fafafa",
        },
        primary: {
          DEFAULT: "#fafafa",
          foreground: "#09090b",
        },
        secondary: {
          DEFAULT: "#1c1c1f",
          foreground: "#a1a1aa",
        },
        muted: {
          DEFAULT: "#1c1c1f",
          foreground: "#71717a",
        },
        accent: {
          DEFAULT: "#1c1c1f",
          foreground: "#fafafa",
        },
        destructive: {
          DEFAULT: "#ef4444",
          foreground: "#fafafa",
        },
        zinc: {
          950: "#09090b",
        },
      },
      borderRadius: {
        lg: "0.5rem",
        md: "0.375rem",
        sm: "0.25rem",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
