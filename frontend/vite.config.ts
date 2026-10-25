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
        /**
         * Vendor code is split by package family, not by named import. The old object
         * form listed `react`/`react-dom`, but the code actually arrives through
         * `react/jsx-runtime` and `react-dom/client`, so that chunk came out at 0.04 kB
         * and React stayed in the entry. A function matches every module in the tree.
         *
         * Grouping by family also keeps the long-lived vendor chunks identical between
         * app deploys, so a changed page does not invalidate React or recharts.
         */
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react';
          if (id.includes('react-router')) return 'router';
          if (id.includes('recharts') || id.includes('d3-')) return 'charts';
          if (id.includes('@tanstack')) return 'query';
          if (id.includes('zustand')) return 'zustand';
          if (id.includes('framer-motion') || id.includes('motion-dom') || id.includes('motion-utils')) return 'motion';
          if (id.includes('@radix-ui')) return 'radix';
          if (id.includes('date-fns')) return 'dates';
          if (id.includes('lucide-react')) return 'icons';
          return;
        },
      },
    },
  },
});
