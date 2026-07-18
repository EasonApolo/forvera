import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { corsDomains } from './config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import * as express from 'express';
import { staticPath } from './shared/staticPath';
import { projectRoot } from './shared/projectRoot';

const appIndexCandidates = [
  join(projectRoot, 'app', 'dist', 'index.html'),
  join(__dirname, '..', '..', 'app', 'dist', 'index.html'),
  join(process.cwd(), 'app', 'dist', 'index.html'),
]
const appIndexPath = appIndexCandidates.find((candidate) => existsSync(candidate)) || appIndexCandidates[0]

process.on('uncaughtException', (error) => {
  // 文件缺失（例如 SPA fallback 找不到 index.html）不应导致进程退出
  if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
    console.error('[warn] uncaughtException (ENOENT, ignored)', error.message);
    return;
  }
  console.error('[fatal] uncaughtException', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[fatal] unhandledRejection', reason);
  process.exit(1);
});

async function bootstrap() {
  const certPath = process.env.SSL_CERT_PATH || '/etc/letsencrypt/live/eason-s.life/fullchain.pem';
  const keyPath = process.env.SSL_KEY_PATH || '/etc/letsencrypt/live/eason-s.life/privkey.pem';
  const forceHttp = process.env.FORVERA_FORCE_HTTP === '1';
  const enableHttps = !forceHttp && existsSync(certPath) && existsSync(keyPath);

  const app = await NestFactory.create(
    AppModule,
    enableHttps
      ? {
          httpsOptions: {
            cert: readFileSync(certPath),
            key: readFileSync(keyPath),
          },
        }
      : undefined,
  );
  app.enableShutdownHooks();
  app.useWebSocketAdapter(new IoAdapter(app));

  // 单镜像部署：后端直接托管前端构建产物（app/dist），
  // 这样前后端同源同进程，只需一个镜像、一个端口(3000)。
  const appDistDir = dirname(appIndexPath);
  if (existsSync(appDistDir)) {
    app.use(express.static(appDistDir, { index: false, maxAge: '1y' }));
  }
  const allowOriginSet = new Set(corsDomains.map((origin) => origin.replace(/\/$/, '')));
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, false);
      }

      const normalizedOrigin = origin.replace(/\/$/, '');

      const isAllowedExact = allowOriginSet.has(normalizedOrigin);
      const isAllowedForvera = /^https?:\/\/([a-z0-9-]+\.)*forvera\.me(:\d+)?$/i.test(normalizedOrigin);
      const isAllowedLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(normalizedOrigin);
      const isAllowedLanIp = /^https?:\/\/(\d{1,3}\.){3}\d{1,3}(:\d+)?$/i.test(normalizedOrigin);

      if (isAllowedExact || isAllowedForvera || isAllowedLocal || isAllowedLanIp) {
        return callback(null, normalizedOrigin);
      }

      return callback(new Error(`CORS blocked for origin: ${origin}`), false);
    },
    credentials: true,
  });

  app.use((req, res, next) => {
    const path = (req.path || '').replace(/^\/+/, '');
    const isResourcePath = path.startsWith('resource/');

    if (isResourcePath) {
      const resourcePath = path.replace(/^resource\//, '');
      const filePath = join(staticPath, resourcePath);
      if (existsSync(filePath)) {
        return res.sendFile(filePath, (err) => {
          if (err) next();
        });
      }
    }
    next();
  });

  app.use((req, res, next) => {
    const path = (req.path || '').replace(/^\/+/, '');
    const accept = String(req.headers.accept || '').toLowerCase();
    const wantsHtml = accept.includes('text/html');
    const isStaticAsset = /\.[a-zA-Z0-9]+$/.test(path);
    const isApiPath = path.startsWith('api/');
    const isResourcePath = path.startsWith('resource/');

    if (req.method === 'GET' && wantsHtml && !isStaticAsset && !isApiPath && !isResourcePath) {
      if (existsSync(appIndexPath)) {
        return res.sendFile(appIndexPath, (err) => {
          if (err) next();
        });
      }

      const fallbackIndexPath = join(staticPath, 'index.html');
      if (existsSync(fallbackIndexPath)) {
        return res.sendFile(fallbackIndexPath, (err) => {
          if (err) next();
        });
      }
    }
    next();
  });

  await app.listen(3000, '0.0.0.0');
  console.log(`[bootstrap] API listening on ${enableHttps ? 'https' : 'http'}://0.0.0.0:3000`);
}
bootstrap().catch((error) => {
  console.error('[fatal] bootstrap failed', error);
  process.exit(1);
});