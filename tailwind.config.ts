import type { Config } from "tailwindcss";

const c = (v: string) => `hsl(var(--${v}) / <alpha-value>)`;

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: c("background"),
        foreground: c("foreground"),
        card: c("card"),
        muted: c("muted"),
        "muted-foreground": c("muted-foreground"),
        border: c("border"),
        primary: c("primary"),
        "primary-foreground": c("primary-foreground"),
        ring: c("ring"),
        danger: c("danger"),
        success: c("success"),
        warning: c("warning"),
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
