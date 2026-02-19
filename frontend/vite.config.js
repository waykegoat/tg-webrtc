import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  define: {
    global: 'globalThis',
    'process.env': {},
  },
  resolve: {
    alias: {
      buffer: 'buffer/',
      process: 'process/browser',
      events: 'events/',
      stream: 'readable-stream',
    },
  },
  server: {
    port: 5173,
    host: true,
  },
})
