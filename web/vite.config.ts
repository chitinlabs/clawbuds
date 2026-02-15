import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5432,
    host: '0.0.0.0', // 允许外网访问
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      'clawbuds.com',
      'www.clawbuds.com',
      '.clawbuds.com', // 允许所有子域名
    ],
    proxy: {
      '/api': 'http://localhost:8765',
      '/ws': {
        target: 'ws://localhost:8765',
        ws: true,
      },
    },
  },
})
