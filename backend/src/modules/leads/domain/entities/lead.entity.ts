export type LeadStatus = 'NEW' | 'REVIEWED' | 'CONTACTED' | 'QUALIFIED' | 'DISQUALIFIED';

export type LeadVerificationStatus = 'VERIFIED' | 'UNVERIFIED' | 'UNKNOWN';

export interface SaveLeadInput {
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
  verificationStatus?: LeadVerificationStatus;
  sourceUrl?: string | null;
  retrievedAt: string;
}

export interface LeadSnapshot {
  id: string;
  userId: string;
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
}
