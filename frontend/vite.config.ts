import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const API = process.env.API_PROXY || 'http://localhost:5000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: API,
        changeOrigin: true,
      },
      '/uploads': {
        target: API,
        changeOrigin: true,
      },
    },
  },
});
