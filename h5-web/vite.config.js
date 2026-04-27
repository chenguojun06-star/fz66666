import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import autoprefixer from 'autoprefixer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5174,
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_API_TARGET || 'http://localhost:8088',
        changeOrigin: true,
      },
      '/ws': {
        target: (process.env.VITE_DEV_API_TARGET || 'http://localhost:8088').replace(/^http/, 'ws'),
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'esnext',
    cssMinify: true,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-axios': ['axios'],
          'vendor-zustand': ['zustand'],
          'vendor-scanner': ['html5-qrcode'],
        },
      },
    },
  },
  esbuild: {
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
  },
  css: {
    postcss: {
      plugins: [autoprefixer()],
    },
  },
});
