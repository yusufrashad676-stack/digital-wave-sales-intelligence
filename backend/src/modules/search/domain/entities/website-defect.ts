/**
 * R6.2 Root Website HTTP Defect — pure derived types.
 *
 * Positive defect evidence only. A root-page HTTPS response whose final
 * HTTP status is 404/410 (NOT_FOUND) or 500..599 (SERVER_ERROR) is an
 * observed defect for that one page at that one instant. This report:
 *
 * - never proves a capability is missing (defect is not absence),
 * - never covers subpages, whole-site availability, persistence, SEO,
 *   performance, security, TLS quality, hosting cause, or business impact,
 * - treats a completed response that does not match the narrow defect
 *   classes as NO_TARGET_DEFECT_OBSERVED — which is NOT a statement that
 *   the website is healthy,
 * - never turns an exception, a cross-origin final response, or a missing
 *   historical field into a defect.
 */

export const WebsiteDefectState = {
  DEFECT_OBSERVED: 'DEFECT_OBSERVED',
  NO_TARGET_DEFECT_OBSERVED: 'NO_TARGET_DEFECT_OBSERVED',
  UNKNOWN: 'UNKNOWN',
} as const;

export type WebsiteDefectState = (typeof WebsiteDefectState)[keyof typeof WebsiteDefectState];

export const WebsiteDefectClass = {
  NOT_FOUND: 'NOT_FOUND',
  SERVER_ERROR: 'SERVER_ERROR',
} as const;

export type WebsiteDefectClass = (typeof WebsiteDefectClass)[keyof typeof WebsiteDefectClass];

/**
 * Stable reason codes. The accompanying `reason` string is human-readable and
 * may change; consumers should branch on the code.
 */
export const WebsiteDefectReasonCode = {
  HTTP_DEFECT_OBSERVED: 'HTTP_DEFECT_OBSERVED',
  NO_TARGET_DEFECT_OBSERVED: 'NO_TARGET_DEFECT_OBSERVED',
  NO_HTTP_OBSERVATION: 'NO_HTTP_OBSERVATION',
  NO_ADMISSIBLE_OBSERVATION: 'NO_ADMISSIBLE_OBSERVATION',
  HTTP_STATUS_MISSING: 'HTTP_STATUS_MISSING',
  REQUESTED_URL_UNKNOWN: 'REQUESTED_URL_UNKNOWN',
  FINAL_URL_UNKNOWN: 'FINAL_URL_UNKNOWN',
  FINAL_URL_MALFORMED: 'FINAL_URL_MALFORMED',
  CROSS_ORIGIN_FINAL_RESPONSE: 'CROSS_ORIGIN_FINAL_RESPONSE',
  REDIRECT_CHAIN_INCOMPLETE: 'REDIRECT_CHAIN_INCOMPLETE',
} as const;

export type WebsiteDefectReasonCode = (typeof WebsiteDefectReasonCode)[keyof typeof WebsiteDefectReasonCode];

export const WEBSITE_DEFECT_ENGINE_VERSION = 1;

/**
 * Provenance pointer back to the persisted root-page HTTP observation. Carries
 * evidence metadata only — never a raw payload, HTML body, or provider blob.
 */
export interface WebsiteDefectEvidence {
  source: string;
  field: string;
  provider: string | null;
  requestedUrl: string | null;
  finalUrl: string | null;
  observedAt: string | null;
}

/**
 * Classification of a single persisted root-page HTTP observation.
 */
export interface WebsiteDefectObservationResult {
  state: WebsiteDefectState;
  defectClass: WebsiteDefectClass | null;
  httpStatus: number | null;
  httpRedirected: boolean | null;
  httpFinalSameOrigin: boolean | null;
  requestedUrl: string | null;
  finalUrl: string | null;
  observedAt: string | null;
  provider: string | null;
  reasonCode: WebsiteDefectReasonCode;
  reason: string;
  evidence: WebsiteDefectEvidence[];
}

export interface CompanyWebsiteDefectReport {
  companyId: string;
  companyName: string;
  computedAt: string;
  engineVersion: number;
  state: WebsiteDefectState;
  defectClass: WebsiteDefectClass | null;
  httpStatus: number | null;
  requestedUrl: string | null;
  finalUrl: string | null;
  observedAt: string | null;
  reasonCode: WebsiteDefectReasonCode;
  reason: string;
  observations: WebsiteDefectObservationResult[];
}
