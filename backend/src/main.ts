import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { setupApp } from './common/setup-app.js';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useWebSocketAdapter(new IoAdapter(app));
  const config = app.get(ConfigService);
  app.useGlobalFilters(new AllExceptionsFilter(config));
  setupApp(app, config);
  const port = config.getOrThrow<number>('app.port');
  await app.listen(port);
}
void bootstrap();
