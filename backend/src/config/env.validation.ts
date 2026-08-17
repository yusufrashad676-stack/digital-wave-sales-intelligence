import type { AppConfig, JwtAlgorithm, NodeEnv, SearchProviderName } from './configuration.js';

const NODE_ENVS: NodeEnv[] = ['development', 'test', 'production'];

const JWT_ALGORITHMS: JwtAlgorithm[] = ['HS256', 'HS384', 'HS512'];

const SEARCH_PROVIDERS: SearchProviderName[] = ['mock', 'google-places'];

const DEV_DEFAULT_ORIGINS = ['http://localhost:5173', 'http://localhost:3000'];

const MIN_JWT_SECRET_LENGTH = 32;

const JWT_SECRET_PLACEHOLDER_PATTERNS = [
  'replace_with',
  'change-me',
  'change_me',
  'your-secret',
  'your_secret',
  'your-secret-here',
  'your_secret_here',
  'example',
  'test-secret',
  'test_secret',
  'changeme',
  'changeme123',
  'password',
  'secret',
  'my-secret',
  'my_secret',
];

const DEFAULT_SEARCH_MAX_RESULTS = 20;

const DEFAULT_SEARCH_GOOGLE_TIMEOUT_MS = 5000;

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

  const accessSecret = toOptionalString(config.JWT_SECRET);
  if (!accessSecret || accessSecret.length < MIN_JWT_SECRET_LENGTH) {
    problems.push(`JWT_SECRET is required and must be at least ${MIN_JWT_SECRET_LENGTH} characters`);
  }

  const refreshSecret = toOptionalString(config.JWT_REFRESH_SECRET);
  if (!refreshSecret || refreshSecret.length < MIN_JWT_SECRET_LENGTH) {
    problems.push(`JWT_REFRESH_SECRET is required and must be at least ${MIN_JWT_SECRET_LENGTH} characters`);
  }

  if (accessSecret && refreshSecret && accessSecret === refreshSecret) {
    problems.push('JWT_SECRET and JWT_REFRESH_SECRET must be distinct');
  }

  if (accessSecret && containsPlaceholder(accessSecret)) {
    problems.push('JWT_SECRET contains a placeholder pattern — replace with a strong random value');
  }

  if (refreshSecret && containsPlaceholder(refreshSecret)) {
    problems.push('JWT_REFRESH_SECRET contains a placeholder pattern — replace with a strong random value');
  }

  const accessTtlSeconds = toInteger(config.JWT_ACCESS_TTL, 900);
  if (!Number.isInteger(accessTtlSeconds) || accessTtlSeconds < 1 || accessTtlSeconds > 86400) {
    problems.push('JWT_ACCESS_TTL must be an integer between 1 and 86400');
  }

  const refreshTtlSeconds = toInteger(config.JWT_REFRESH_TTL, 2592000);
  if (!Number.isInteger(refreshTtlSeconds) || refreshTtlSeconds < 60 || refreshTtlSeconds > 31536000) {
    problems.push('JWT_REFRESH_TTL must be an integer between 60 and 31536000');
  }

  const rawAlgorithm = toOptionalString(config.JWT_ALGORITHM);
  const algorithm: JwtAlgorithm = rawAlgorithm === undefined ? 'HS256' : (rawAlgorithm as JwtAlgorithm);
  if (!JWT_ALGORITHMS.includes(algorithm)) {
    problems.push(`JWT_ALGORITHM must be one of: ${JWT_ALGORITHMS.join(', ')}`);
  }

  const authTtlSeconds = toInteger(config.AUTH_THROTTLE_TTL_SECONDS, 60);
  if (!Number.isInteger(authTtlSeconds) || authTtlSeconds < 1) {
    problems.push('AUTH_THROTTLE_TTL_SECONDS must be an integer >= 1');
  }

  const authLimit = toInteger(config.AUTH_THROTTLE_LIMIT, 10);
  if (!Number.isInteger(authLimit) || authLimit < 1) {
    problems.push('AUTH_THROTTLE_LIMIT must be an integer >= 1');
  }

  const googleMapsApiKey = toOptionalString(config.GOOGLE_MAPS_API_KEY);

  const rawSearchProvider = toOptionalString(config.SEARCH_PROVIDER);
  const normalizedSearchProvider =
    rawSearchProvider === undefined ? undefined : (rawSearchProvider.toLowerCase() as SearchProviderName);
  if (rawSearchProvider !== undefined && !SEARCH_PROVIDERS.includes(normalizedSearchProvider as SearchProviderName)) {
    problems.push(`SEARCH_PROVIDER must be one of: ${SEARCH_PROVIDERS.join(', ')}`);
  }

  const searchProvider: SearchProviderName = normalizedSearchProvider ?? (googleMapsApiKey ? 'google-places' : 'mock');
  if (searchProvider === 'google-places' && googleMapsApiKey === undefined) {
    problems.push('GOOGLE_MAPS_API_KEY is required when SEARCH_PROVIDER is "google-places"');
  }

  const searchMaxResults = toInteger(config.SEARCH_MAX_RESULTS, DEFAULT_SEARCH_MAX_RESULTS);
  if (!Number.isInteger(searchMaxResults) || searchMaxResults < 1 || searchMaxResults > 20) {
    problems.push('SEARCH_MAX_RESULTS must be an integer between 1 and 20');
  }

  const searchGoogleTimeoutMs = toInteger(config.SEARCH_GOOGLE_TIMEOUT_MS, DEFAULT_SEARCH_GOOGLE_TIMEOUT_MS);
  if (!Number.isInteger(searchGoogleTimeoutMs) || searchGoogleTimeoutMs < 1) {
    problems.push('SEARCH_GOOGLE_TIMEOUT_MS must be an integer >= 1');
  }

  // Enrichment configuration
  const enrichmentEnabled = toOptionalString(config.ENRICHMENT_ENABLED);
  const isEnrichmentEnabled = enrichmentEnabled !== 'false'; // default true

  const enrichmentWebsiteTimeoutMs = toInteger(config.ENRICHMENT_WEBSITE_TIMEOUT_MS, 5000);
  if (!Number.isInteger(enrichmentWebsiteTimeoutMs) || enrichmentWebsiteTimeoutMs < 1000) {
    problems.push('ENRICHMENT_WEBSITE_TIMEOUT_MS must be an integer >= 1000');
  }

  const enrichmentSocialTimeoutMs = toInteger(config.ENRICHMENT_SOCIAL_TIMEOUT_MS, 5000);
  if (!Number.isInteger(enrichmentSocialTimeoutMs) || enrichmentSocialTimeoutMs < 1000) {
    problems.push('ENRICHMENT_SOCIAL_TIMEOUT_MS must be an integer >= 1000');
  }

  const enrichmentVerificationTimeoutMs = toInteger(config.ENRICHMENT_VERIFICATION_TIMEOUT_MS, 3000);
  if (!Number.isInteger(enrichmentVerificationTimeoutMs) || enrichmentVerificationTimeoutMs < 1000) {
    problems.push('ENRICHMENT_VERIFICATION_TIMEOUT_MS must be an integer >= 1000');
  }

  const enrichmentMaxConcurrent = toInteger(config.ENRICHMENT_MAX_CONCURRENT, 5);
  if (!Number.isInteger(enrichmentMaxConcurrent) || enrichmentMaxConcurrent < 1 || enrichmentMaxConcurrent > 10) {
    problems.push('ENRICHMENT_MAX_CONCURRENT must be an integer between 1 and 10');
  }

  const enrichmentMaxResponseBytes = toInteger(config.ENRICHMENT_MAX_RESPONSE_BYTES, 1_048_576);
  if (
    !Number.isInteger(enrichmentMaxResponseBytes) ||
    enrichmentMaxResponseBytes < 1024 ||
    enrichmentMaxResponseBytes > 10_485_760
  ) {
    problems.push('ENRICHMENT_MAX_RESPONSE_BYTES must be an integer between 1024 and 10485760');
  }

  const enrichmentMaxRedirects = toInteger(config.ENRICHMENT_MAX_REDIRECTS, 3);
  if (!Number.isInteger(enrichmentMaxRedirects) || enrichmentMaxRedirects < 0 || enrichmentMaxRedirects > 10) {
    problems.push('ENRICHMENT_MAX_REDIRECTS must be an integer between 0 and 10');
  }

  const enrichmentUserAgent = toOptionalString(config.ENRICHMENT_USER_AGENT) ?? 'DigitalWave';

  const enrichmentMaxRequestTimeoutMs = toInteger(config.ENRICHMENT_MAX_REQUEST_TIMEOUT_MS, 300_000);
  if (!Number.isInteger(enrichmentMaxRequestTimeoutMs) || enrichmentMaxRequestTimeoutMs < 10_000) {
    problems.push('ENRICHMENT_MAX_REQUEST_TIMEOUT_MS must be an integer >= 10000');
  }

  if (problems.length > 0) {
    throw new Error(`Invalid environment configuration:\n- ${problems.join('\n- ')}`);
  }

  return {
    app: { nodeEnv, port },
    database: { directUrl: directUrl as string },
    cors: { origins },
    throttle: { ttlSeconds, limit },
    auth: {
      jwt: {
        accessSecret: accessSecret as string,
        refreshSecret: refreshSecret as string,
        accessTtlSeconds,
        refreshTtlSeconds,
        algorithm,
      },
      throttle: { ttlSeconds: authTtlSeconds, limit: authLimit },
    },
    search: {
      provider: searchProvider,
      googleMapsApiKey,
      maxResults: searchMaxResults,
      googleTimeoutMs: searchGoogleTimeoutMs,
    },
    enrichment: {
      enabled: isEnrichmentEnabled,
      websiteTimeoutMs: enrichmentWebsiteTimeoutMs,
      socialTimeoutMs: enrichmentSocialTimeoutMs,
      verificationTimeoutMs: enrichmentVerificationTimeoutMs,
      maxConcurrent: enrichmentMaxConcurrent,
      maxResponseBytes: enrichmentMaxResponseBytes,
      maxRedirects: enrichmentMaxRedirects,
      userAgent: enrichmentUserAgent,
      maxRequestTimeoutMs: enrichmentMaxRequestTimeoutMs,
    },
  };
}

function containsPlaceholder(value: string): boolean {
  const lower = value.toLowerCase();
  return JWT_SECRET_PLACEHOLDER_PATTERNS.some((pattern) => lower.includes(pattern));
}
