import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: process.env.API_PROXY ?? 'http://127.0.0.1:3001', changeOrigin: false },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/@fullcalendar/')) return 'calendar';
          if (id.includes('/node_modules/recharts/') || id.includes('/node_modules/d3-'))
            return 'charts';
          if (/\/node_modules\/(react|react-dom|react-router|react-router-dom)\//.test(id))
            return 'react';
        },
      },
    },
  },
});
