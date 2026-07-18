import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import fs from 'fs'

const certPath = process.env.SSL_CERT_PATH || '/etc/letsencrypt/live/eason-s.life/fullchain.pem'
const keyPath = process.env.SSL_KEY_PATH || '/etc/letsencrypt/live/eason-s.life/privkey.pem'
const forceHttp = process.env.FORVERA_FORCE_HTTP === '1'
const enablePreviewHttps = !forceHttp && fs.existsSync(certPath) && fs.existsSync(keyPath)

// https://vitejs.dev/config/
export default defineConfig({
  publicDir: 'public',
  plugins: [vue()],
  server: {
    host: '0.0.0.0',
    port: 10000,
  },
  preview: {
    host: '0.0.0.0',
    port: 10000,
    https: enablePreviewHttps
      ? {
          cert: fs.readFileSync(certPath),
          key: fs.readFileSync(keyPath),
          // Vite 2.x + Node 20/22 may crash on HTTP/2 response handling in preview.
          // Force TLS ALPN to HTTP/1.1 to avoid Http2ServerResponse runtime error.
          ALPNProtocols: ['http/1.1'],
        }
      : false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      components: path.resolve(__dirname, './src/components'),
      views: path.resolve(__dirname, './src/views'),
      store: path.resolve(__dirname, './src/store'),
      shared: path.resolve(__dirname, '../shared'),
    },
  },
})
