import { createApp } from 'vue'
import App from './App.vue'
import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap-icons/font/bootstrap-icons.css'
import { Buffer } from 'buffer'

// Make Buffer available globally for isomorphic-git
window.Buffer = Buffer

// The vite-plugin-monaco-editor-esm will handle worker configuration
// We don't need to set MonacoEnvironment here

createApp(App).mount('#app')