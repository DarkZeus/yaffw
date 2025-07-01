import { defineConfig } from 'vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import tanstackRouter from '@tanstack/router-plugin/vite'
import { resolve } from 'node:path'
import { rmSync, existsSync, readdirSync } from 'node:fs'

// Custom plugin to cleanup uploads folder on dev server start
const cleanupUploadsPlugin = () => ({
  name: 'cleanup-uploads',
  configureServer() {
    const uploadsPath = resolve(__dirname, './uploads')
    
    if (existsSync(uploadsPath)) {
      try {
        // Clean contents but keep the folder
        const files = readdirSync(uploadsPath)
        files.forEach(file => {
          rmSync(resolve(uploadsPath, file), { recursive: true, force: true })
        })
        console.log('✨ Uploads folder contents cleaned up')
      } catch (error) {
        console.warn('⚠️ Could not cleanup uploads folder:', error)
      }
    }
  },
})


// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    tanstackRouter({ autoCodeSplitting: true }),
    viteReact(),
    tailwindcss(),
    cleanupUploadsPlugin(),
  ],
  server: {
    port: 3000,
    open: true,
    host: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
})
