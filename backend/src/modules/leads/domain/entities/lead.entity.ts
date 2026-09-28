export type LeadStatus = 'NEW' | 'REVIEWED' | 'CONTACTED' | 'QUALIFIED' | 'DISQUALIFIED';

export type LeadVerificationStatus = 'VERIFIED' | 'UNVERIFIED' | 'UNKNOWN';

/**
 * Structural shape of the enrichment snapshot persisted on a lead. Copied verbatim
 * from the source SearchResult at save time (except transient states); mirrors the
 * stored JSONB contract without coupling the leads domain to the search module.
 */
export interface LeadEnrichmentSnapshot {
  website?: {
    title: string | null;
    description: string | null;
    techHints: string[];
    socialLinks: string[];
  };
  social?: {
    profiles: Array<{
      platform: string;
      handle: string;
      profileUrl: string;
      confidence: number;
      verified: boolean;
    }>;
  };
  errors?: Array<{ type: string; message: string; provider: string }>;
  enrichedAt?: string;
  enrichmentVersion?: number;
}

/** Enrichment state copied from a server-side verified SearchResult at save time. */
export interface LeadEnrichmentCopy {
  enrichmentStatus: string;
  enrichmentSnapshot: LeadEnrichmentSnapshot | null;
  enrichedAt: Date | null;
}

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
  /** Optional reference to the source SearchResult; enrichment is copied server-side. */
  searchResultId?: string;
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
  enrichmentStatus: string;
  enrichmentSnapshot: LeadEnrichmentSnapshot | null;
  enrichedAt: string | null;
  retrievedAt: string;
  savedAt: string;
  createdAt: string;
  updatedAt: string;
}
