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
          primary: '#667eea',
          'primary-dark': '#764ba2',
          bg: '#f5f5f5',
          card: '#ffffff',
          text: '#333333',
          'text-light': '#666666',
          'text-muted': '#888888',
          border: '#e0e0e0',
          success: '#27ae60',
          warning: '#f39c12',
          danger: '#e74c3c',
          tag: '#e8e8ff',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        'card': '0 2px 8px rgba(0, 0, 0, 0.08)',
        'card-hover': '0 4px 12px rgba(102, 126, 234, 0.4)',
        'float': '0 20px 60px rgba(0, 0, 0, 0.3)',
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
