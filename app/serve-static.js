const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const host = '0.0.0.0';
const port = Number(process.env.APP_PORT || 10000);
const distDir = path.join(__dirname, 'dist');

const certPath = process.env.SSL_CERT_PATH || '/etc/letsencrypt/live/eason-s.life/fullchain.pem';
const keyPath = process.env.SSL_KEY_PATH || '/etc/letsencrypt/live/eason-s.life/privkey.pem';
const forceHttp = process.env.FORVERA_FORCE_HTTP === '1';
const enableHttps = !forceHttp && fs.existsSync(certPath) && fs.existsSync(keyPath);

if (!fs.existsSync(distDir)) {
  console.error(`[serve-static] dist directory not found: ${distDir}`);
  process.exit(1);
}

const mimeMap = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

const sendFile = (filePath, res) => {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Internal Server Error');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.statusCode = 200;
    res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable');
    res.end(data);
  });
};

const serverHandler = (req, res) => {
  const reqUrl = new URL(req.url || '/', 'http://localhost');
  let pathname = decodeURIComponent(reqUrl.pathname || '/');

  if (pathname === '/') {
    pathname = '/index.html';
  }

  const normalized = path.normalize(pathname).replace(/^\.\.(\/|\\|$)/, '');
  const filePath = path.join(distDir, normalized);

  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isFile()) {
      sendFile(filePath, res);
      return;
    }

    const indexPath = path.join(distDir, 'index.html');
    sendFile(indexPath, res);
  });
};

const server = enableHttps
  ? https.createServer(
      {
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath),
        ALPNProtocols: ['http/1.1'],
      },
      serverHandler,
    )
  : http.createServer(serverHandler);

server.listen(port, host, () => {
  console.log(`[serve-static] ${enableHttps ? 'https' : 'http'}://${host}:${port}`);
  console.log(`[serve-static] serving ${distDir}`);
});
