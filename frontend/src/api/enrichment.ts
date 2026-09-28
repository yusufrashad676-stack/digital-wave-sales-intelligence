import { requestJson } from './request';
import type { EnrichmentView } from './executions';

export interface LeadEnrichmentResult {
  leadId: string;
  enrichment: EnrichmentView | null;
  durationMs: number;
}

export function enrichLead(
  leadId: string,
  body?: { skipWebsite?: boolean; skipSocial?: boolean },
  opts?: Parameters<typeof requestJson>[2],
) {
  return requestJson<{ data: LeadEnrichmentResult }>(
    `${import.meta.env.VITE_API_URL ?? ''}/api/v1/leads/${encodeURIComponent(leadId)}/enrich`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    },
    opts,
  );
}
