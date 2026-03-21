/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      colors: {
        primary: "#004be3",
        "primary-container": "#819bff",
        "on-primary-container": "#001b61",
        secondary: "#006763",
        "secondary-container": "#29fcf3",
        "on-secondary-container": "#005c59",
        tertiary: "#b90037",
        "tertiary-container": "#ff9099",
        "on-tertiary-container": "#68001b",
        background: "#f5f6f7",
        surface: "#f5f6f7",
        "surface-container-lowest": "#ffffff",
        "surface-container-low": "#eff1f2",
        "surface-container": "#e6e8ea",
        "surface-container-high": "#e0e3e4",
        "surface-container-highest": "#dadddf",
        "surface-variant": "#dadddf",
        outline: "#757778",
        "outline-variant": "#abadae",
        "on-surface": "#2c2f30",
        "on-surface-variant": "#595c5d",
      },
      fontFamily: {
        headline: ["Plus Jakarta Sans", "ui-sans-serif", "system-ui"],
        body: ["Inter", "ui-sans-serif", "system-ui"],
        label: ["Inter", "ui-sans-serif", "system-ui"],
      },
      borderRadius: {
        lg: "2rem",
        xl: "3rem",
      },
      boxShadow: {
        ambient: "0 20px 50px rgba(44,47,48,0.06)",
        float: "0 8px 30px rgba(0,0,0,0.06)",
      },
    },
  },
  plugins: [],
};
