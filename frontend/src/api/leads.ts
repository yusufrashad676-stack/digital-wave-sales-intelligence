import { requestJson } from './request';
import type { EnrichmentView } from './executions';
import type { SearchResult } from './search';

export type LeadStatus = 'NEW' | 'REVIEWED' | 'CONTACTED' | 'QUALIFIED' | 'DISQUALIFIED';

export type LeadVerificationStatus = 'VERIFIED' | 'UNVERIFIED' | 'UNKNOWN';

export interface SavedLead {
  id: string;
  status: LeadStatus;
  notes: string | null;
  providerId: string;
  providerRecordId: string;
  companyName: string;
  category: string | null;
  area: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  rating: number | null;
  ratingCount: number | null;
  verificationStatus: LeadVerificationStatus;
  sourceUrl: string | null;
  retrievedAt: string;
  savedAt: string;
  createdAt: string;
  updatedAt: string;
  enrichment: EnrichmentView | null;
}

export interface SaveLeadPayload {
  providerId: string;
  providerRecordId: string;
  companyName: string;
  category?: string | null;
  address?: string | null;
  area?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  rating?: number | null;
  ratingCount?: number | null;
  verificationStatus?: string;
  sourceUrl?: string | null;
  retrievedAt: string;
}

export interface SavedLeadsResponse {
  data: SavedLead[];
  meta: { count: number };
}

const ENDPOINT = '/api/v1/leads';

export async function saveLead(payload: SaveLeadPayload): Promise<SavedLead> {
  const response = await requestJson<{ data: SavedLead }>(ENDPOINT, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return response.data;
}

export async function fetchSavedLeads(): Promise<SavedLeadsResponse> {
  return requestJson<SavedLeadsResponse>(ENDPOINT, { method: 'GET' });
}

export async function updateSavedLead(
  id: string,
  patch: { status?: LeadStatus; notes?: string | null },
): Promise<SavedLead> {
  const response = await requestJson<{ data: SavedLead }>(`${ENDPOINT}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return response.data;
}

export async function removeSavedLead(id: string): Promise<void> {
  await requestJson<{ data: { success: boolean } }>(`${ENDPOINT}/${id}`, { method: 'DELETE' });
}

export function savedLeadToResult(lead: SavedLead): SearchResult {
  return {
    providerId: lead.providerId,
    providerRecordId: lead.providerRecordId,
    companyName: lead.companyName,
    category: lead.category,
    address: lead.address,
    area: lead.area,
    phone: lead.phone,
    website: lead.website,
    rating: lead.rating,
    ratingCount: lead.ratingCount,
    verificationStatus: lead.verificationStatus,
    sourceUrl: lead.sourceUrl,
    retrievedAt: lead.retrievedAt,
  };
}

export function resultToSavePayload(result: SearchResult): SaveLeadPayload {
  return {
    providerId: result.providerId,
    providerRecordId: result.providerRecordId,
    companyName: result.companyName,
    category: result.category,
    address: result.address,
    area: result.area,
    phone: result.phone,
    website: result.website,
    rating: result.rating,
    ratingCount: result.ratingCount,
    verificationStatus: result.verificationStatus,
    sourceUrl: result.sourceUrl,
    retrievedAt: result.retrievedAt,
  };
}
