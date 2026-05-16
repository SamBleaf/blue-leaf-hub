import forms from "@tailwindcss/forms";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#006c9b",
        accent: "#2E6B4F",
        warning: "#D4A24C",
        surface: "#FFFFFF",
        page: "#F8F9FA",
        muted: "#64748B",
        ink: "#1A1A2E",
        danger: "#DC2626",
        success: "#16A34A",
        hairline: "#E2E8F0"
      },
      fontFamily: {
        sans: ["Lato", "-apple-system", "BlinkMacSystemFont", '"Segoe UI"', "Roboto", "Helvetica", "Arial", "sans-serif"]
      },
      borderRadius: {
        lg: "8px",
        card: "12px"
      }
    }
  },
  plugins: [forms]
};
