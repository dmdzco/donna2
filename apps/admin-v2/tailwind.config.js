/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        admin: {
          primary: '#E8CFC6',
          'primary-dark': '#D4B5A8',
          bg: '#FDFCF8',
          card: '#ffffff',
          text: '#1A1A1A',
          'text-light': '#555555',
          'text-muted': '#888888',
          border: '#E8E4DF',
          success: '#6B8F71',
          warning: '#D4A843',
          danger: '#C45B52',
          tag: '#F8EDE8',
          accent: '#D49A7C',
          'accent-hover': '#C48B6E',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        'card': '0 4px 20px rgba(0, 0, 0, 0.05)',
        'card-hover': '0 4px 12px rgba(212, 154, 124, 0.25)',
        'float': '0 10px 40px rgba(0, 0, 0, 0.08)',
      },
      keyframes: {
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'toast-in': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in-up': 'fade-in-up 0.6s ease-out',
        'slide-in': 'slide-in 0.3s ease-out',
        'toast-in': 'toast-in 0.3s ease-out',
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
