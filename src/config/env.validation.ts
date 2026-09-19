import { plainToInstance } from 'class-transformer';
import { IsEnum, IsInt, IsString, Max, Min, validateSync } from 'class-validator';

export enum Environment {
  Development = 'development',
  Test = 'test',
  Staging = 'staging',
  Production = 'production',
}

// Validacion estricta: la app NO arranca si falta o esta mal una variable
// de entorno critica. Preferible fallar en el arranque que en produccion
// a medianoche con un despacho activo.
class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment;

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number;

  @IsString()
  DB_HOST: string;

  @IsInt()
  DB_PORT: number;

  @IsString()
  DB_USERNAME: string;

  @IsString()
  DB_PASSWORD: string;

  @IsString()
  DB_DATABASE: string;

  @IsString()
  REDIS_HOST: string;

  @IsInt()
  REDIS_PORT: number;

  @IsString()
  JWT_SECRET: string;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(
      `Variables de entorno invalidas o faltantes:\n${errors
        .map((e) => Object.values(e.constraints ?? {}).join(', '))
        .join('\n')}`,
    );
  }

  const environment = validatedConfig.NODE_ENV;
  const jwtSecret = String(validatedConfig.JWT_SECRET ?? '');
  const forbiddenSecrets = new Set([
    'changeme',
    'dev-only-secret-not-for-production',
    'test-secret',
    'staging-secret',
    'production-secret',
  ]);
  if (
    (environment === Environment.Staging || environment === Environment.Production) &&
    (jwtSecret.length < 32 || forbiddenSecrets.has(jwtSecret.toLowerCase()))
  ) {
    throw new Error('JWT_SECRET debe ser un secreto real de al menos 32 caracteres en staging/production');
  }

  return validatedConfig;
}
