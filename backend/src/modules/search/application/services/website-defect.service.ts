import { Injectable } from '@nestjs/common';
import {
  CompanyEvidenceBundle,
  CompanyObservationInput,
  WebsiteHttpObservation,
} from '../../domain/entities/company-intelligence.js';
import {
  CompanyWebsiteDefectReport,
  WEBSITE_DEFECT_ENGINE_VERSION,
  WebsiteDefectClass,
  WebsiteDefectEvidence,
  WebsiteDefectObservationResult,
  WebsiteDefectReasonCode,
  WebsiteDefectState,
} from '../../domain/entities/website-defect.js';

const ROOT_URL_PREFIX = 'https://';
const EVIDENCE_SOURCE = 'search-result-enrichment';
const EVIDENCE_FIELD = 'website.httpStatus';

function nonEmpty(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * The root URL exactly as the provider requested it (`https://<domain>`),
 * so same-origin comparisons are coherent with the persisted observation.
 */
function rootUrl(domain: string | null | undefined): string | null {
  const trimmed = nonEmpty(domain);
  return trimmed === null ? null : `${ROOT_URL_PREFIX}${trimmed}`;
}

function isRedirectStatus(status: number): boolean {
  return status >= 300 && status < 400;
}

/**
 * The narrow R6.2 defect classes. Any other completed-response status is not
 * a target defect.
 */
function defectClassFor(status: number): WebsiteDefectClass | null {
  if (status === 404 || status === 410) {
    return WebsiteDefectClass.NOT_FOUND;
  }
  if (status >= 500 && status <= 599) {
    return WebsiteDefectClass.SERVER_ERROR;
  }
  return null;
}

function observationKey(result: WebsiteDefectObservationResult): string {
  return [
    result.requestedUrl ?? '',
    result.finalUrl ?? '',
    result.httpStatus ?? '',
    result.httpRedirected ?? '',
    result.observedAt ?? '',
    result.provider ?? '',
  ].join('|');
}

function compareObservations(left: WebsiteDefectObservationResult, right: WebsiteDefectObservationResult): number {
  return (
    (left.observedAt ?? '').localeCompare(right.observedAt ?? '') ||
    (left.finalUrl ?? '').localeCompare(right.finalUrl ?? '') ||
    (left.requestedUrl ?? '').localeCompare(right.requestedUrl ?? '') ||
    (left.httpStatus ?? 0) - (right.httpStatus ?? 0)
  );
}

/**
 * R6.2 Root Website HTTP Defect engine.
 *
 * Pure and deterministic: classification depends only on admissible persisted
 * factual HTTP observations for the completed root-page response. No network
 * calls, no DB calls, no AI, no clock-dependent classification (`computedAt`
 * is metadata only).
 *
 * Conservative rules:
 * - A defect is reported only as "HTTP <status> was observed ..." — never
 *   "the website is currently down/broken".
 * - A positively observed admissible defect remains reportable even if another
 *   observation shows no target defect; that is not reinterpreted as present
 *   or persistent health.
 * - No path leads UNKNOWN to DEFECT_OBSERVED.
 */
@Injectable()
export class CompanyWebsiteDefectService {
  build(bundle: CompanyEvidenceBundle, now: Date = new Date()): CompanyWebsiteDefectReport {
    const observations = this.evaluateObservations(bundle);
    const aggregated = this.aggregate(observations);

    return {
      companyId: bundle.companyId,
      companyName: bundle.companyName,
      computedAt: now.toISOString(),
      engineVersion: WEBSITE_DEFECT_ENGINE_VERSION,
      state: aggregated.state,
      defectClass: aggregated.defectClass,
      httpStatus: aggregated.httpStatus,
      requestedUrl: aggregated.requestedUrl,
      finalUrl: aggregated.finalUrl,
      observedAt: aggregated.observedAt,
      reasonCode: aggregated.reasonCode,
      reason: aggregated.reason,
      observations,
    };
  }

  private evaluateObservations(bundle: CompanyEvidenceBundle): WebsiteDefectObservationResult[] {
    const unique = new Map<string, WebsiteDefectObservationResult>();
    for (const observation of bundle.observations) {
      const http = observation.websiteHttp;
      if (http === null || http === undefined) {
        continue;
      }
      const result = this.classify(observation, http);
      unique.set(observationKey(result), result);
    }
    return [...unique.values()].sort(compareObservations);
  }

  private classify(observation: CompanyObservationInput, http: WebsiteHttpObservation): WebsiteDefectObservationResult {
    const requestedUrl = rootUrl(observation.websiteDomain);
    const finalUrl = nonEmpty(http.httpFinalUrl);
    const provider = nonEmpty(observation.websiteCapabilities?.provider);
    const observedAt = toIso(
      observation.websiteCapabilities?.fetchedAt ?? observation.websiteFetchedAt ?? observation.retrievedAt,
    );
    const evidence: WebsiteDefectEvidence[] = [
      {
        source: EVIDENCE_SOURCE,
        field: EVIDENCE_FIELD,
        provider,
        requestedUrl,
        finalUrl,
        observedAt,
      },
    ];

    const status = http.httpStatus;
    if (status === null) {
      return {
        state: WebsiteDefectState.UNKNOWN,
        defectClass: null,
        httpStatus: null,
        httpRedirected: http.httpRedirected,
        httpFinalSameOrigin: http.httpFinalSameOrigin,
        requestedUrl,
        finalUrl,
        observedAt,
        provider,
        reasonCode: WebsiteDefectReasonCode.HTTP_STATUS_MISSING,
        reason: 'No HTTP status was recorded for the completed root-page response; no defect was proven either way.',
        evidence,
      };
    }

    if (requestedUrl === null) {
      return {
        state: WebsiteDefectState.UNKNOWN,
        defectClass: null,
        httpStatus: status,
        httpRedirected: http.httpRedirected,
        httpFinalSameOrigin: http.httpFinalSameOrigin,
        requestedUrl,
        finalUrl,
        observedAt,
        provider,
        reasonCode: WebsiteDefectReasonCode.REQUESTED_URL_UNKNOWN,
        reason: 'No requested root URL could be determined; no defect can be attributed.',
        evidence,
      };
    }

    if (finalUrl === null) {
      return {
        state: WebsiteDefectState.UNKNOWN,
        defectClass: null,
        httpStatus: status,
        httpRedirected: http.httpRedirected,
        httpFinalSameOrigin: http.httpFinalSameOrigin,
        requestedUrl,
        finalUrl,
        observedAt,
        provider,
        reasonCode: WebsiteDefectReasonCode.FINAL_URL_UNKNOWN,
        reason: 'No final URL was recorded for the completed root-page response; same-origin cannot be established.',
        evidence,
      };
    }

    if (http.httpFinalSameOrigin !== true) {
      return {
        state: WebsiteDefectState.UNKNOWN,
        defectClass: null,
        httpStatus: status,
        httpRedirected: http.httpRedirected,
        httpFinalSameOrigin: http.httpFinalSameOrigin,
        requestedUrl,
        finalUrl,
        observedAt,
        provider,
        reasonCode:
          http.httpFinalSameOrigin === false
            ? WebsiteDefectReasonCode.CROSS_ORIGIN_FINAL_RESPONSE
            : WebsiteDefectReasonCode.FINAL_URL_MALFORMED,
        reason:
          http.httpFinalSameOrigin === false
            ? 'The root-page response completed on a different origin; its status is not attributed to this business.'
            : 'The final URL of the root-page response could not be parsed; same-origin cannot be established.',
        evidence,
      };
    }

    if (isRedirectStatus(status)) {
      return {
        state: WebsiteDefectState.UNKNOWN,
        defectClass: null,
        httpStatus: status,
        httpRedirected: http.httpRedirected,
        httpFinalSameOrigin: http.httpFinalSameOrigin,
        requestedUrl,
        finalUrl,
        observedAt,
        provider,
        reasonCode: WebsiteDefectReasonCode.REDIRECT_CHAIN_INCOMPLETE,
        reason: `A redirect status (HTTP ${status}) was observed and the redirect chain did not resolve to a final response; no defect can be attributed.`,
        evidence,
      };
    }

    const defectClass = defectClassFor(status);
    if (defectClass !== null) {
      return {
        state: WebsiteDefectState.DEFECT_OBSERVED,
        defectClass,
        httpStatus: status,
        httpRedirected: http.httpRedirected,
        httpFinalSameOrigin: http.httpFinalSameOrigin,
        requestedUrl,
        finalUrl,
        observedAt,
        provider,
        reasonCode: WebsiteDefectReasonCode.HTTP_DEFECT_OBSERVED,
        reason: `HTTP ${status} was observed on the root page served at ${finalUrl} on ${observedAt}.`,
        evidence,
      };
    }

    return {
      state: WebsiteDefectState.NO_TARGET_DEFECT_OBSERVED,
      defectClass: null,
      httpStatus: status,
      httpRedirected: http.httpRedirected,
      httpFinalSameOrigin: http.httpFinalSameOrigin,
      requestedUrl,
      finalUrl,
      observedAt,
      provider,
      reasonCode: WebsiteDefectReasonCode.NO_TARGET_DEFECT_OBSERVED,
      reason:
        `A completed root-page response with HTTP ${status} was observed; it does not match the R6.2 defect classes and ` +
        'does not establish that the website is healthy.',
      evidence,
    };
  }

  private aggregate(observations: readonly WebsiteDefectObservationResult[]): {
    state: WebsiteDefectState;
    defectClass: WebsiteDefectClass | null;
    httpStatus: number | null;
    requestedUrl: string | null;
    finalUrl: string | null;
    observedAt: string | null;
    reasonCode: WebsiteDefectReasonCode;
    reason: string;
  } {
    if (observations.length === 0) {
      return {
        state: WebsiteDefectState.UNKNOWN,
        defectClass: null,
        httpStatus: null,
        requestedUrl: null,
        finalUrl: null,
        observedAt: null,
        reasonCode: WebsiteDefectReasonCode.NO_HTTP_OBSERVATION,
        reason: 'No root-page HTTP observation exists for this company; no defect was proven either way.',
      };
    }

    const defects = observations.filter((item) => item.state === WebsiteDefectState.DEFECT_OBSERVED);
    if (defects.length > 0) {
      const observed = defects[0]!;
      return {
        state: WebsiteDefectState.DEFECT_OBSERVED,
        defectClass: observed.defectClass,
        httpStatus: observed.httpStatus,
        requestedUrl: observed.requestedUrl,
        finalUrl: observed.finalUrl,
        observedAt: observed.observedAt,
        reasonCode: WebsiteDefectReasonCode.HTTP_DEFECT_OBSERVED,
        reason: `HTTP ${observed.httpStatus} was observed on the root page served at ${observed.finalUrl} on ${observed.observedAt}.`,
      };
    }

    const hasNonTarget = observations.some((item) => item.state === WebsiteDefectState.NO_TARGET_DEFECT_OBSERVED);
    if (hasNonTarget) {
      return {
        state: WebsiteDefectState.NO_TARGET_DEFECT_OBSERVED,
        defectClass: null,
        httpStatus: null,
        requestedUrl: null,
        finalUrl: null,
        observedAt: null,
        reasonCode: WebsiteDefectReasonCode.NO_TARGET_DEFECT_OBSERVED,
        reason:
          'Completed root-page responses were observed but never matched an R6.2 defect class; this does not establish that the website is healthy.',
      };
    }

    return {
      state: WebsiteDefectState.UNKNOWN,
      defectClass: null,
      httpStatus: null,
      requestedUrl: null,
      finalUrl: null,
      observedAt: null,
      reasonCode: WebsiteDefectReasonCode.NO_ADMISSIBLE_OBSERVATION,
      reason:
        'Recorded root-page HTTP observations were present but none was admissible; no defect was proven either way.',
    };
  }
}
