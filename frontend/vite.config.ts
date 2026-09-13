import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    // Split vendor code so a UI change does not invalidate the whole bundle
    // in CloudFront — meaningful on Indian mobile connections.
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          auth: ['aws-amplify'],
          query: ['@tanstack/react-query'],
        },
      },
    },
    chunkSizeWarningLimit: 900,
  },
  server: {
    port: 5173,
  },
});
