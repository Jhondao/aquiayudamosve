/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Emergency-appropriate palette: high contrast, not decorative.
        ink: "#111318",
        surface: "#1b1e26",
        surface2: "#242832",
        border: "#333846",
        accent: "#3b6fe0",
        danger: "#d84a3d",
        safe: "#3f9d5e",
        warn: "#d99a2b",
        brand: "#4beb9b",
      },
    },
  },
  plugins: [],
};
