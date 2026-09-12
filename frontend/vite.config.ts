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
    // HMR must reference the host machine (not the container) when running in Docker.
    // The browser reaches Vite through the *mapped host port*, so let the client derive
    // protocol/host/port from window.location instead of hardcoding them. Hardcoding
    // host:localhost/port:3000 breaks every checkout whose host port differs (this dev
    // env serves on :6200 → the browser tried ws://localhost:3000 and never connected).
    // Set VITE_HMR_PORT only when the app is served behind a proxy on another port.
    hmr: process.env.DOCKER
      ? process.env.VITE_HMR_PORT
        ? { clientPort: Number(process.env.VITE_HMR_PORT) }
        : {}
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
