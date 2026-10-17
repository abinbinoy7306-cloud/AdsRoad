import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { razorpayApiPlugin } from './vite-plugin-razorpay-api.js'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/AdsRoad/' : '/',
  plugins: [react(), razorpayApiPlugin()],
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  server: {
    host: 'localhost',
    port: 3000,
    strictPort: true,
  },
  preview: {
    host: 'localhost',
    port: 3000,
    strictPort: true,
  },
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('@supabase')) return 'vendor-supabase';
          if (id.includes('lucide-react')) return 'vendor-icons';
          if (id.includes('react-dom') || id.includes('react/')) return 'vendor-react';
        },
      },
    },
  },
})
