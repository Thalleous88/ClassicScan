/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Surfaces
        bg: "#0B0B0E",
        surface: "#141418",
        "surface-raised": "#1C1C22",
        hairline: "#26262C",

        // Ink
        ink: "#F4F4F5",
        "ink-muted": "#A1A1AA",
        "ink-faint": "#52525B",

        // Accent
        accent: "#6EE7B7",
        "accent-ink": "#0B0B0E",
        "accent-soft": "#0F2E26",

        // Status
        warning: "#FBBF24",
        "warning-ink": "#3B2A06",
        danger: "#F87171",
        "danger-ink": "#3B0A0A",
      },
      borderRadius: {
        xs: "6px",
        sm: "10px",
        md: "14px",
        lg: "20px",
        pill: "999px",
      },
      spacing: {
        18: "72px",
      },
      fontFamily: {
        sans: ["PlusJakartaSans_400Regular"],
        medium: ["PlusJakartaSans_500Medium"],
        semibold: ["PlusJakartaSans_600SemiBold"],
        bold: ["PlusJakartaSans_700Bold"],
        extrabold: ["PlusJakartaSans_800ExtraBold"],
      },
      letterSpacing: {
        eyebrow: "1.4px",
      },
    },
  },
  plugins: [],
};
