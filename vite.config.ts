import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { port: 3002, strictPort: true },
  preview: { port: 3002, strictPort: true },
})
