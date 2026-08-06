import type { AppConfig, NodeEnv } from './configuration.js';

const NODE_ENVS: NodeEnv[] = ['development', 'test', 'production'];

const DEV_DEFAULT_ORIGINS = ['http://localhost:5173', 'http://localhost:3000'];

function toOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function toInteger(value: unknown, fallback: number): number {
  if (value === undefined || value === '') {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : NaN;
}

function parseOriginList(value: string): string[] {
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

function parseNodeEnv(value: unknown): NodeEnv {
  if (value === undefined || value === '') {
    return 'development';
  }
  const candidate = String(value);
  return (NODE_ENVS as string[]).includes(candidate) ? (candidate as NodeEnv) : 'development';
}

export function validateEnv(config: Record<string, unknown>): AppConfig {
  const problems: string[] = [];

  const nodeEnv = parseNodeEnv(config.NODE_ENV);

  const port = toInteger(config.APP_PORT, 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    problems.push('APP_PORT must be an integer between 1 and 65535');
  }

  const directUrl = toOptionalString(config.DIRECT_DATABASE_URL);
  if (!directUrl) {
    problems.push('DIRECT_DATABASE_URL is required (postgres:// connection string for the runtime driver adapter)');
  }

  const rawOrigins = toOptionalString(config.CORS_ORIGINS);
  const origins = rawOrigins ? parseOriginList(rawOrigins) : nodeEnv === 'production' ? [] : DEV_DEFAULT_ORIGINS;

  const ttlSeconds = toInteger(config.THROTTLE_TTL_SECONDS, 60);
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1) {
    problems.push('THROTTLE_TTL_SECONDS must be an integer >= 1');
  }

  const limit = toInteger(config.THROTTLE_LIMIT, 100);
  if (!Number.isInteger(limit) || limit < 1) {
    problems.push('THROTTLE_LIMIT must be an integer >= 1');
  }

  if (problems.length > 0) {
    throw new Error(`Invalid environment configuration:\n- ${problems.join('\n- ')}`);
  }

  return {
    app: { nodeEnv, port },
    database: { directUrl: directUrl as string },
    cors: { origins },
    throttle: { ttlSeconds, limit },
  };
}
