import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const devApiTarget = process.env.VITE_API_URL_DEV || 'https://donna-api-dev.up.railway.app';
const prodApiTarget = process.env.VITE_API_URL_PROD || 'https://donna-api-production-2450.up.railway.app';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3002,
    proxy: {
      '/dev-api': {
        target: devApiTarget,
        changeOrigin: true,
        rewrite: path => path.replace(/^\/dev-api/, ''),
      },
      '/prod-api': {
        target: prodApiTarget,
        changeOrigin: true,
        rewrite: path => path.replace(/^\/prod-api/, ''),
      },
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
