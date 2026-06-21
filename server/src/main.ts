import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { corsDomains } from './config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { staticPath } from './shared/staticPath';

const appIndexPath = join(__dirname, '..', '..', 'app', 'dist', 'index.html');

process.on('uncaughtException', (error) => {
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
        return res.sendFile(filePath);
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
        return res.sendFile(appIndexPath);
      }

      const fallbackIndexPath = join(staticPath, 'index.html');
      if (existsSync(fallbackIndexPath)) {
        return res.sendFile(fallbackIndexPath);
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