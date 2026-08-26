import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    globals: true,
    // ห้ามให้เทสต์ไปหยิบค่าจาก .env ในเครื่องใคร — .env ถูก gitignore ไว้
    // เครื่องที่มีไฟล์นี้จะได้ผลไม่เหมือน CI แล้วบั๊กหลุดขึ้น production ได้
    // (เคยหลุดมาแล้ว: CI build โดยไม่มี VITE_API_BASE_URL -> ยิงไป /undefined/login -> 405)
    env: {
      VITE_API_BASE_URL: '',
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        }
      }
    }
  }
})