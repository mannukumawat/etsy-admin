/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Resolved from this project's root by Vite (admin/src).
      '@': '/src',
    },
  },
  server: {
    port: 5174,
    strictPort: true,
  },
  preview: {
    port: 4174,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          forms: ['react-hook-form', '@hookform/resolvers', 'zod'],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
