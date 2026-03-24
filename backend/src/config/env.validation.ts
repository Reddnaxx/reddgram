import { plainToInstance } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export class EnvironmentVariables {
  @IsString()
  DATABASE_URL!: string;

  @IsString()
  @MinLength(8, { message: 'JWT_SECRET must be at least 8 characters' })
  JWT_SECRET!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT?: number;

  @IsOptional()
  @IsString()
  FRONTEND_URL?: string;

  @IsOptional()
  @IsString()
  NODE_ENV?: string;

  @IsOptional()
  @IsString()
  UPLOAD_DIR?: string;
}

const ENV_DEFAULTS: Record<string, string> = {
  PORT: '3000',
  FRONTEND_URL: 'http://localhost:5173',
  NODE_ENV: 'development',
};

export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const merged = { ...ENV_DEFAULTS, ...config };
  const validated = plainToInstance(EnvironmentVariables, merged, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
    throw new Error(`Environment validation failed:\n${messages.join('\n')}`);
  }
  return validated;
}
