import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: "#102A43",
        slateDeep: "#334E68",
        silver: "#D9E2EC",
        emeraldAction: "#2BB673",
        mist: "#F5F8FB"
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      boxShadow: {
        quiet: "0 14px 40px rgba(16, 42, 67, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;

