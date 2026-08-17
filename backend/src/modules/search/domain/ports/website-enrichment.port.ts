import type { WebsiteEnrichmentData } from '../entities/enrichment-snapshot.js';

export interface WebsiteEnrichmentRequest {
  domain: string;
  timeoutMs: number;
}

export interface WebsiteEnrichmentResult {
  domain: string;
  data: WebsiteEnrichmentData;
}

export const WebsiteEnrichmentPort = Symbol('WebsiteEnrichmentPort');

export interface WebsiteEnrichmentPort {
  readonly providerId: string;
  enrich(request: WebsiteEnrichmentRequest): Promise<WebsiteEnrichmentResult>;
}
