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

/**
 * First-party website capability signals captured during enrichment and
 * surfaced through the shared evidence read contract.
 *
 * These are positive-observation fields only. `bodyAnalyzed` records whether
 * the fetched response body was actually obtained and evaluated by the
 * capability scanner: `true` proves analysis of that one body, `false` means
 * the fetch completed without an analyzable body (non-OK or empty response),
 * and `null` is historical/unknown. `fetchedAt` is NOT evidence of analysis —
 * it is set even when no body was obtained.
 *
 * Consumers must treat a null or false value as "not observed" rather than as
 * proven absence: analyzing one page never proves a capability is absent from
 * the business or the site.
 */
export interface WebsiteCapabilityObservation {
  provider: string | null;
  fetchedAt: Date | string | null;
  bodyAnalyzed: boolean | null;
  reachable: boolean | null;
  https: boolean | null;
  contactPageUrl: string | null;
  hasContactForm: boolean | null;
  bookingPageUrl: string | null;
  whatsappUrl: string | null;
}

/**
 * R6.2 root-website HTTP observation — factual metadata about the completed
 * HTTPS root-page SafeFetcher response, parsed from the enrichment snapshot.
 *
 * Orthogonal to capability analysis: a non-OK response can carry no capability
 * facts (`bodyAnalyzed` false) while still being positively evaluable for the
 * narrow R6.2 HTTP defect classes. All fields are `null` in historical rows
 * that predate the R6.2 marker; nothing here is ever inferred from other
 * fields (`bodyAnalyzed`, `fetchedAt`, `reachable`, `https`).
 */
export interface WebsiteHttpObservation {
  httpStatus: number | null;
  httpRedirected: boolean | null;
  httpFinalUrl: string | null;
  httpFinalSameOrigin: boolean | null;
}

/**
 * Provider commercial signals observed alongside a discovery result.
 *
 * Read-only context: never an input to R4 verification, R5 gap states, or any
 * R6 computation. Exposed so consumers can see them without inferring
 * capability or opportunity from them.
 */
export interface CommercialObservation {
  rating: number | null;
  ratingCount: number | null;
  category: string | null;
  area: string | null;
  verificationStatus: string | null;
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
  websiteCapabilities?: WebsiteCapabilityObservation | null;
  websiteHttp?: WebsiteHttpObservation | null;
  commercial?: CommercialObservation | null;
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
