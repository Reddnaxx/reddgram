import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { setupApp } from './common/setup-app.js';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useWebSocketAdapter(new IoAdapter(app));
  const config = app.get(ConfigService);
  app.useGlobalFilters(new AllExceptionsFilter(config));
  setupApp(app, config);
  const uploadDir = config.getOrThrow<string>('app.uploadDir');
  const uploadRoot = resolve(process.cwd(), uploadDir);
  await mkdir(uploadRoot, { recursive: true });
  app.useStaticAssets(uploadRoot, { prefix: '/uploads/' });
  const port = config.getOrThrow<number>('app.port');
  await app.listen(port);
}
void bootstrap();
