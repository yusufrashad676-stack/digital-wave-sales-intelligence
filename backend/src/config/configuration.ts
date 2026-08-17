export type NodeEnv = 'development' | 'test' | 'production';

export type JwtAlgorithm = 'HS256' | 'HS384' | 'HS512';

export type SearchProviderName = 'mock' | 'google-places';

export type AppConfig = {
  app: {
    nodeEnv: NodeEnv;
    port: number;
  };
  database: {
    directUrl: string;
  };
  cors: {
    origins: string[];
  };
  throttle: {
    ttlSeconds: number;
    limit: number;
  };
  auth: {
    jwt: {
      accessSecret: string;
      refreshSecret: string;
      accessTtlSeconds: number;
      refreshTtlSeconds: number;
      algorithm: JwtAlgorithm;
    };
    throttle: {
      ttlSeconds: number;
      limit: number;
    };
  };
  search: {
    provider: SearchProviderName;
    googleMapsApiKey?: string;
    maxResults: number;
    googleTimeoutMs: number;
  };
  enrichment: {
    enabled: boolean;
    websiteTimeoutMs: number;
    socialTimeoutMs: number;
    verificationTimeoutMs: number;
    maxConcurrent: number;
    maxResponseBytes: number;
    maxRedirects: number;
    userAgent: string;
    maxRequestTimeoutMs: number;
  };
};
