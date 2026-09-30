export const EvidenceState = {
  OBSERVED: 'OBSERVED',
  VERIFIED: 'VERIFIED',
  UNKNOWN: 'UNKNOWN',
  CONFLICTED: 'CONFLICTED',
  FAILED: 'FAILED',
} as const;

export type EvidenceState = (typeof EvidenceState)[keyof typeof EvidenceState];

export const WebsiteCheckState = {
  UNKNOWN: 'UNKNOWN',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
} as const;

export type WebsiteCheckState = (typeof WebsiteCheckState)[keyof typeof WebsiteCheckState];

export const FactualDimension = {
  WEBSITE: 'website',
  PHONE: 'phone',
  EMAIL: 'email',
  SOCIAL: 'social',
  LOCATION: 'location',
} as const;

export type FactualDimension = (typeof FactualDimension)[keyof typeof FactualDimension];

export const QualityDimension = {
  COMPLETENESS: 'completeness',
  PROVENANCE: 'provenance',
  VALIDITY: 'validity',
  CONSISTENCY: 'consistency',
  FRESHNESS: 'freshness',
} as const;

export type QualityDimension = (typeof QualityDimension)[keyof typeof QualityDimension];

export interface WebsiteEvidenceInput {
  domain: string | null;
  url: string | null;
  evidenceSource: string | null;
  evidenceUrl: string | null;
  observedAt: Date | string | null;
}

export interface PhoneEvidenceInput {
  value: string;
  countryCode: string | null;
  evidenceSource: string | null;
  evidenceUrl: string | null;
  observedAt: Date | string | null;
}

export interface EmailEvidenceInput {
  value: string;
  evidenceSource: string | null;
  evidenceUrl: string | null;
  observedAt: Date | string | null;
}

export interface SocialProfileEvidenceInput {
  platform: string | null;
  handle: string | null;
  profileUrl: string | null;
  evidenceSource: string | null;
  evidenceUrl: string | null;
  observedAt: Date | string | null;
}

export interface LocationEvidenceInput {
  formattedAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  city: string | null;
  region: string | null;
  countryCode: string | null;
  evidenceSource: string | null;
  evidenceUrl: string | null;
  observedAt: Date | string | null;
}

export interface CompanyObservationInput {
  retrievedAt: Date | string | null;
  sourceUrl: string | null;
  websiteDomain: string | null;
  latitude: number | null;
  longitude: number | null;
  formattedAddress: string | null;
  websiteCheckSucceeded: boolean;
  websiteCheckFailed: boolean;
  websiteFetchedAt: Date | string | null;
  socialChecks: Array<{
    platform: string | null;
    profileUrl: string | null;
    verified: boolean;
  }>;
}

export interface CompanyEvidenceBundle {
  companyId: string;
  companyName: string;
  websites: WebsiteEvidenceInput[];
  phones: PhoneEvidenceInput[];
  emails: EmailEvidenceInput[];
  socialProfiles: SocialProfileEvidenceInput[];
  locations: LocationEvidenceInput[];
  observations: CompanyObservationInput[];
}

export interface FactVerification {
  dimension: FactualDimension;
  state: EvidenceState;
  value: string | null;
  count: number;
  observedAt: string | null;
  reasons: string[];
}

export interface FactualDimensionReport {
  dimension: FactualDimension;
  state: EvidenceState;
  count: number;
  observedAt: string | null;
  details: string[];
}

export interface ProvenanceDimensionReport {
  dimension: FactualDimension;
  facts: number;
  evidenced: number;
  evidenceless: number;
}

export interface FreshnessDimensionReport {
  dimension: FactualDimension;
  observedAt: string | null;
  facts: number;
}

export interface ValidityDimensionReport {
  dimension: FactualDimension;
  facts: number;
  invalid: number;
  details: string[];
}

export interface DataQualityReport {
  completeness: {
    evidenced: number;
    unknown: number;
    dimensions: FactualDimension[];
    fraction: number;
    details: string[];
  };
  provenance: {
    total: number;
    evidenced: number;
    evidenceless: number;
    dimensions: ProvenanceDimensionReport[];
    details: string[];
  };
  validity: {
    total: number;
    invalid: number;
    dimensions: ValidityDimensionReport[];
    details: string[];
  };
  consistency: {
    conflicting: number;
    dimensions: FactualDimension[];
    details: string[];
  };
  freshness: {
    latestObservedAt: string | null;
    dimensions: FreshnessDimensionReport[];
    details: string[];
  };
}

export interface CompanyIntelligenceSummary {
  companyId: string;
  companyName: string;
  computedAt: string;
  dimensions: Record<FactualDimension, FactVerification>;
  quality: DataQualityReport;
}
