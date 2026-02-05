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
          primary: '#A8946B',
          'primary-dark': '#8F7D5A',
          bg: '#FDFCF8',
          card: '#ffffff',
          text: '#1A1A1A',
          'text-light': '#555555',
          'text-muted': '#888888',
          border: '#E5E7EB',
          success: '#6B8F71',
          warning: '#D4A843',
          danger: '#C45B52',
          tag: '#F3EDE4',
          accent: '#E8A0A0',
          'accent-hover': '#D89090',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        'card': '0 4px 20px rgba(0, 0, 0, 0.05)',
        'card-hover': '0 4px 12px rgba(168, 148, 107, 0.3)',
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
