/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        bg: '#FDFCF8',
        primary: '#4A5D4F',
        'primary-dark': '#3d4e42',
        card: '#F2F0E9',
        'text-primary': '#1A1A1A',
        'text-secondary': '#5E5D5A',
        fab: '#E8A0A0',
        'good-bg': '#E8F5E9',
        'good-text': '#2E7D32',
        'missed-bg': '#FFF3E0',
        'missed-text': '#E65100',
      },
      fontFamily: {
        serif: ['Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};
