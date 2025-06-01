import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import monaco from 'vite-plugin-monaco-editor-esm'
import { Buffer } from 'buffer'

export default defineConfig({
  plugins: [
    vue(),
    // ESM build (Vite 5+)
    monaco({
      languageWorkers: ['editorWorkerService','json','css','html','typescript']
    })
  ],

  define: {
    global: 'globalThis'
  },

  optimizeDeps: {
    exclude: ['monaco-editor']
  },

  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          monaco: ['monaco-editor']   // keep your chunk split
        }
      }
    }
  }
});