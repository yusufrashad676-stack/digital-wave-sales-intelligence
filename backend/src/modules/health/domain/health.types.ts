export type ServiceStatus = 'up' | 'down';

export type HealthReport = {
  status: 'ok' | 'degraded';
  services: {
    database: ServiceStatus;
  };
  timestamp: string;
};
