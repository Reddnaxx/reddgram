import type { Server } from 'node:http';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { AllExceptionsFilter } from './../src/common/filters/all-exceptions.filter.js';
import { setupApp } from './../src/common/setup-app.js';

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(() => {
    process.env.DATABASE_URL ??= 'file:./dev.db';
    process.env.JWT_SECRET ??= 'e2e-test-jwt-secret-min-8-chars';
  });

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    const config = app.get(ConfigService);
    app.useGlobalFilters(new AllExceptionsFilter(config));
    setupApp(app, config);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /health', () => {
    return request(app.getHttpServer() as Server)
      .get('/health')
      .expect(200)
      .expect({ status: 'ok' });
  });
});
