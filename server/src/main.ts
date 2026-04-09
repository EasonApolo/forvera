import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { corsDomains } from './config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { existsSync } from 'fs';
import { join } from 'path';
import { staticPath } from './shared/staticPath';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useWebSocketAdapter(new IoAdapter(app));
  const allowOriginSet = new Set(corsDomains);
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }

      const isAllowedExact = allowOriginSet.has(origin);
      const isAllowedLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
      const isAllowedLanIp = /^https?:\/\/(\d{1,3}\.){3}\d{1,3}(:\d+)?$/i.test(origin);

      if (isAllowedExact || isAllowedLocal || isAllowedLanIp) {
        return callback(null, true);
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
      const indexPath = join(staticPath, 'index.html');
      if (existsSync(indexPath)) {
        return res.sendFile(indexPath);
      }
    }
    next();
  });

  await app.listen(3000, '0.0.0.0');
}
bootstrap();