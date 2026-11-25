import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import fs from 'fs'
import http from 'http'

const certPath = process.env.SSL_CERT_PATH || '/etc/letsencrypt/live/eason-s.life/fullchain.pem'
const keyPath = process.env.SSL_KEY_PATH || '/etc/letsencrypt/live/eason-s.life/privkey.pem'
const forceHttp = process.env.FORVERA_FORCE_HTTP === '1'
const enablePreviewHttps = !forceHttp && fs.existsSync(certPath) && fs.existsSync(keyPath)

// 只转发首页。Vite 的 proxy 用前缀匹配，不能把 "/" 写进 proxy，否则所有请求都会进 Next。
function proxySsrRoot() {
  return {
    name: 'proxy-ssr-root',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const raw = req.url || ''
        if (raw.split('?')[0] !== '/') return next()
        const proxyReq = http.request(
          {
            hostname: '127.0.0.1',
            port: 10001,
            path: raw,
            method: req.method,
            headers: req.headers,
          },
          proxyRes => {
            res.writeHead(proxyRes.statusCode || 502, proxyRes.headers)
            proxyRes.pipe(res)
          },
        )
        proxyReq.on('error', () => {
          if (!res.headersSent) {
            res.statusCode = 502
            res.end('SSR unavailable')
          }
        })
        req.pipe(proxyReq)
      })
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  publicDir: 'public',
  plugins: [vue(), proxySsrRoot()],
  server: {
    host: '0.0.0.0',
    port: 10000,
    // 与线上 Caddy 一致：文章列表和文章页交给 app-ssr，图片走后端。
    proxy: {
      '/postList': 'http://127.0.0.1:10001',
      '/post/': 'http://127.0.0.1:10001',
      '/_next': 'http://127.0.0.1:10001',
      '/api': 'http://127.0.0.1:3000',
      '/resource': 'http://127.0.0.1:3000',
    },
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
