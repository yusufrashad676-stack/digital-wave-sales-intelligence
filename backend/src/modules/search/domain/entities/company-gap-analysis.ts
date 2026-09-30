/**
 * R5 Digital Gap Engine — pure derived types.
 *
 * These types carry no framework dependencies. A gap analysis is always
 * recomputed from persisted R4 evidence; nothing here is authoritative storage.
 */

export const GapState = {
  PRESENT: 'PRESENT',
  MISSING: 'MISSING',
  UNKNOWN: 'UNKNOWN',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
} as const;

export type GapState = (typeof GapState)[keyof typeof GapState];

export const GapDimension = {
  WEBSITE: 'WEBSITE',
  BOOKING: 'BOOKING',
  CONTACT_CAPTURE: 'CONTACT_CAPTURE',
  SOCIAL_PRESENCE: 'SOCIAL_PRESENCE',
  WHATSAPP: 'WHATSAPP',
  ONLINE_PRESENCE: 'ONLINE_PRESENCE',
  BASIC_DIGITAL_FOUNDATION: 'BASIC_DIGITAL_FOUNDATION',
  CRM_SYSTEM: 'CRM_SYSTEM',
  AUTOMATION: 'AUTOMATION',
  AI_USAGE: 'AI_USAGE',
} as const;

export type GapDimension = (typeof GapDimension)[keyof typeof GapDimension];

/**
 * Stable reason codes. The accompanying `reason` string is human-readable and
 * may change; consumers should branch on the code.
 */
export const GapReasonCode = {
  EVIDENCE_PRESENT: 'EVIDENCE_PRESENT',
  NO_EVIDENCE_OBSERVED: 'NO_EVIDENCE_OBSERVED',
  ABSENCE_NOT_ADMISSIBLE: 'ABSENCE_NOT_ADMISSIBLE',
  DIMENSION_NOT_EVALUABLE: 'DIMENSION_NOT_EVALUABLE',
  DERIVED_FROM_PARENT: 'DERIVED_FROM_PARENT',
} as const;

export type GapReasonCode = (typeof GapReasonCode)[keyof typeof GapReasonCode];

export const GapEvidenceSource = {
  CANONICAL_WEBSITE: 'canonical-website',
  CANONICAL_SOCIAL_PROFILE: 'canonical-social-profile',
  SEARCH_RESULT_ENRICHMENT: 'search-result-enrichment',
} as const;

export type GapEvidenceSource = (typeof GapEvidenceSource)[keyof typeof GapEvidenceSource];

/**
 * Structured pointer back to the observation that produced a state. Carries
 * provenance metadata only — never a raw payload, HTML body, or provider blob.
 */
export interface GapEvidenceReference {
  source: GapEvidenceSource;
  field: string;
  provider: string | null;
  url: string | null;
  observedAt: string | null;
}

export interface GapResult {
  dimension: GapDimension;
  state: GapState;
  reasonCode: GapReasonCode;
  reason: string;
  evidence: GapEvidenceReference[];
}

export interface CompanyGapAnalysis {
  companyId: string;
  companyName: string;
  computedAt: string;
  gaps: GapResult[];
}
