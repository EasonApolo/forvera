const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const host = '0.0.0.0';
const port = Number(process.env.APP_PORT || 10000);
const distDir = path.join(__dirname, 'dist');
// 爬虫动态渲染时反代本机后端 API 用
const serverPort = Number(process.env.SERVER_PORT || 3000);
const apiBase = `http://127.0.0.1:${serverPort}`;
const siteDomain = process.env.CADDY_DOMAIN || 'eason-s.life';

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

// ── 爬虫动态渲染（dynamic rendering）──
// Googlebot 等第一波抓取不执行 JS，SPA 空壳里没有内容；对爬虫直接返回
// 服务端从后端 API 拼好的真实 HTML（Google 官方认可的做法），普通用户不受影响。
const BOT_UA_RE =
  /(Googlebot|bingbot|YandexBot|Baiduspider|DuckDuckBot|Slurp|facebookexternalhit|Twitterbot|LinkedInBot|PetalBot|AhrefsBot|SemrushBot)/i;
const BOT_CACHE_TTL = 10 * 60 * 1000;
const botCache = new Map();

const escapeHtmlText = (s) =>
  String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

function fetchJsonApi(apiPath) {
  return new Promise((resolve, reject) => {
    const req = http.get(`${apiBase}${apiPath}`, { timeout: 5000 }, res => {
      let body = '';
      res.on('data', chunk => (body += chunk));
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`API ${res.statusCode}`));
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('API timeout'));
    });
  });
}

const pageShell = (title, description, canonical, bodyHtml) => `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtmlText(title)}</title>
  <meta name="description" content="${escapeHtmlText(description)}">
  <link rel="canonical" href="${canonical}">
</head>
<body>
${bodyHtml}
</body>
</html>`;

async function renderBotPost(postId) {
  const post = await fetchJsonApi(`/api/post/${encodeURIComponent(postId)}`);
  if (!post || !post.title) return null;
  return pageShell(
    post.title,
    post.description || '',
    `https://${siteDomain}/post/${postId}`,
    `<article>\n  <h1>${escapeHtmlText(post.title)}</h1>\n  <div>${post.content || ''}</div>\n</article>`
  );
}

async function renderBotHome() {
  const posts = await fetchJsonApi('/api/post');
  if (!Array.isArray(posts)) return null;
  const items = posts
    .map(p => `  <li><a href="/post/${encodeURIComponent(p._id)}">${escapeHtmlText(p.title)}</a></li>`)
    .join('\n');
  return pageShell(
    '文章列表',
    '',
    `https://${siteDomain}/`,
    `<h1>文章列表</h1>\n<ul>\n${items}\n</ul>`
  );
}

/** 命中返回 true；渲染失败或路径不适用时返回 false，回退到正常静态流程 */
async function serveBotPage(pathname, res) {
  const cached = botCache.get(pathname);
  if (cached && cached.expiresAt > Date.now()) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(cached.html);
    return true;
  }
  const postIdMatch = pathname.match(/^\/post\/([A-Za-z0-9_-]+)\/?$/);
  let html = null;
  try {
    if (postIdMatch) {
      html = await renderBotPost(postIdMatch[1]);
    } else if (pathname === '/') {
      html = await renderBotHome();
    }
  } catch (err) {
    console.warn(`[serve-static] bot render failed (${pathname}): ${err.message}`);
  }
  if (!html) return false;
  botCache.set(pathname, { expiresAt: Date.now() + BOT_CACHE_TTL, html });
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
  res.end(html);
  return true;
}

const serverHandler = async (req, res) => {
  try {
    const reqUrl = new URL(req.url || '/', 'http://localhost');
    let pathname;
    // 非法的百分号编码（扫描器常见）会让 decodeURIComponent 抛错，捕获后返回 400，避免整个进程崩溃。
    try {
      pathname = decodeURIComponent(reqUrl.pathname || '/');
    } catch {
      // 记录畸形 URL（一般是扫描器），便于排查来源
      console.warn(`[serve-static] 400 malformed URL: ${req.url}`);
      res.statusCode = 400;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Bad Request');
      return;
    }

    // %00（null 字节）等控制字符能顺利通过 decodeURIComponent，却会让 fs.stat 同步抛错（曾导致进程崩溃），直接拒绝。
    if (/[\x00-\x1f\x7f]/.test(pathname)) {
      console.warn(`[serve-static] 400 control chars in path: ${req.url}`);
      res.statusCode = 400;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Bad Request');
      return;
    }

    // 爬虫请求文章页/首页时返回动态渲染的真实 HTML，失败回退正常流程
    if (BOT_UA_RE.test(String(req.headers['user-agent'] || ''))) {
      if (await serveBotPage(pathname, res)) return;
    }

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
  } catch (err) {
    // 兜底：handler 内任何同步/异步异常都不允许击穿进程（静态服务曾因此崩过）
    console.error(`[serve-static] 500 handler error: ${req.url}`, err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    }
    res.end('Internal Server Error');
  }
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
