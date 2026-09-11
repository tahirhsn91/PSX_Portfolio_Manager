import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    // Bind to all interfaces so Vite is reachable from outside Docker container
    host: '0.0.0.0',
    // Only open browser when NOT running inside Docker
    open: !process.env.DOCKER,
    // HMR must reference the host machine (not container) when running in Docker
    hmr: process.env.DOCKER
      ? { host: 'localhost', port: 3000 }
      : true,
    // File-system polling — required for HMR inside Docker on Windows/WSL2
    watch: {
      usePolling: !!process.env.CHOKIDAR_USEPOLLING,
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          router: ['react-router-dom'],
          charts: ['recharts'],
          query: ['@tanstack/react-query'],
          zustand: ['zustand'],
        },
      },
    },
  },
});
