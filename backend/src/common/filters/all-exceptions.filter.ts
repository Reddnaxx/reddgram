import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly config: ConfigService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      if (
        typeof payload === 'object' &&
        payload !== null &&
        !Array.isArray(payload)
      ) {
        response.status(status).json(payload);
      } else {
        response.status(status).json({
          statusCode: status,
          message: payload,
        });
      }
      return;
    }

    const nodeEnv = this.config.get<string>('app.nodeEnv', 'development');
    const isDev = nodeEnv === 'development';
    this.logger.error(exception);

    const status = HttpStatus.INTERNAL_SERVER_ERROR;
    const body: Record<string, unknown> = {
      statusCode: status,
      message: 'Internal server error',
      path: request.url,
    };
    if (isDev && exception instanceof Error) {
      body.message = exception.message;
    }
    response.status(status).json(body);
  }
}
