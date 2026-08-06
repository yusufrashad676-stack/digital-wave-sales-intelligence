export type NodeEnv = 'development' | 'test' | 'production';

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
};
