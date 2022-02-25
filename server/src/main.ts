import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { corsDomains } from './config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: corsDomains, credentials: true });
  await app.listen(3000);
}
bootstrap();