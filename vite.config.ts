import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // For GitHub Pages: set to your repo name when deploying
  // e.g. '/cip17-survey-poc/' if deployed to username.github.io/cip17-survey-poc/
  // Use '/' for local dev or custom domain
  base: process.env.GITHUB_PAGES === 'true' ? '/cip-17-survey-tool/' : '/',
})
