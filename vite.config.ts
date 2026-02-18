import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    nodePolyfills({
      // Required by @meshsdk/core-cst (crypto, buffer, stream, etc.)
      include: ['crypto', 'buffer', 'stream', 'events', 'util', 'process'],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
  ],
  // For GitHub Pages: set to your repo name when deploying
  base: process.env.GITHUB_PAGES === 'true' ? '/cip-17-survey-tool/' : '/',
  build: {
    // Mesh SDK is large — increase warning limit
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          // Split heavy Cardano / Mesh SDK into its own chunk (lazy-loaded)
          'mesh-sdk': ['@meshsdk/core'],
          // Split React / UI libs
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-charts': ['recharts'],
        },
      },
    },
  },
})
