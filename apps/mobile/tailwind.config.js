/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        sage: { DEFAULT: "#4A5D4F", dark: "#3d4e42" },
        cream: "#FDFCF8",
        beige: "#F2F0E9",
        "accent-pink": { DEFAULT: "#E8A0A0", hover: "#D89090" },
        charcoal: "#1A1A1A",
        muted: "#5E5D5A",
      },
      fontFamily: {
        serif: ["PlayfairDisplay_400Regular"],
        "serif-medium": ["PlayfairDisplay_500Medium"],
        "serif-semibold": ["PlayfairDisplay_600SemiBold"],
        "serif-bold": ["PlayfairDisplay_700Bold"],
      },
      borderRadius: {
        "2xl": "16px",
        "3xl": "20px",
        "4xl": "24px",
      },
    },
  },
  plugins: [],
};
