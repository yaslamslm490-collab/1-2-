import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const previewHost = process.env.NADA_PREVIEW_HOST;

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: previewHost ? [previewHost] : [],
    proxy: {
      '/api': 'http://127.0.0.1:8080',
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: previewHost ? [previewHost] : [],
    proxy: {
      '/api': 'http://127.0.0.1:8080',
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
