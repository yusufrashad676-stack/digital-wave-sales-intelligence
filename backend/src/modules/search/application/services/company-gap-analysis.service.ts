import { Injectable } from '@nestjs/common';
import { normalizeWebsiteEvidence } from '../../domain/entities/canonical-evidence.js';
import {
  CompanyEvidenceBundle,
  CompanyObservationInput,
  WebsiteCapabilityObservation,
} from '../../domain/entities/company-intelligence.js';
import {
  CompanyGapAnalysis,
  GapDimension,
  GapEvidenceReference,
  GapEvidenceSource,
  GapReasonCode,
  GapResult,
  GapState,
} from '../../domain/entities/company-gap-analysis.js';

/**
 * Shared epistemic caveat appended to every "not observed" reason. The
 * snapshot records whether one response body was analyzed (`bodyAnalyzed`),
 * but analyzing a single first-party page still cannot establish that a
 * capability is absent from the business or from the rest of the site, so
 * absence is never admissible.
 */
const ABSENCE_LIMITATION =
  'A not-observed value means only that one response body did not show the capability; even a fully analyzed body does not prove the capability is absent from the business or the site, and a non-OK or empty response persists the same empty values.';

const NON_EVALUABLE_DIMENSIONS: readonly GapDimension[] = [
  GapDimension.CRM_SYSTEM,
  GapDimension.AUTOMATION,
  GapDimension.AI_USAGE,
];

const NOT_EVALUABLE_REASON =
  'No deterministic evidence source for this capability exists in the current pipeline; it is never inferred from absence or from unrelated signals.';

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

function nonEmpty(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

interface ObservedSignal {
  url: string | null;
}

/**
 * A signal is observed only when it carries a real value. Empty and
 * whitespace-only strings are treated as "not observed", matching the
 * defensive parsing applied to persisted snapshots.
 */
function urlSignal(value: string | null): ObservedSignal | null {
  const url = nonEmpty(value);
  return url === null ? null : { url };
}

/**
 * Removes duplicate references and orders them deterministically so identical
 * input always yields byte-identical output.
 */
function normalizeEvidence(references: readonly GapEvidenceReference[]): GapEvidenceReference[] {
  const unique = new Map<string, GapEvidenceReference>();
  for (const reference of references) {
    unique.set(
      `${reference.source}|${reference.field}|${reference.provider ?? ''}|${reference.url ?? ''}|${reference.observedAt ?? ''}`,
      reference,
    );
  }
  return [...unique.values()].sort(
    (left, right) =>
      left.source.localeCompare(right.source) ||
      left.field.localeCompare(right.field) ||
      (left.url ?? '').localeCompare(right.url ?? '') ||
      (left.provider ?? '').localeCompare(right.provider ?? '') ||
      (left.observedAt ?? '').localeCompare(right.observedAt ?? ''),
  );
}

function present(dimension: GapDimension, reason: string, references: readonly GapEvidenceReference[]): GapResult {
  return {
    dimension,
    state: GapState.PRESENT,
    reasonCode: GapReasonCode.EVIDENCE_PRESENT,
    reason,
    evidence: normalizeEvidence(references),
  };
}

function unknown(dimension: GapDimension, reasonCode: GapReasonCode, reason: string): GapResult {
  return { dimension, state: GapState.UNKNOWN, reasonCode, reason, evidence: [] };
}

/**
 * R5 Digital Gap Engine.
 *
 * Pure and deterministic: the same evidence bundle always yields the same
 * classification. It performs no network access, no AI inference, and no
 * persistence — every result is derived on read.
 *
 * Epistemic contract:
 * - Only positive observations move a dimension to PRESENT.
 * - Absence is never inferred. A dimension with no admissible evidence stays
 *   UNKNOWN; it is never reported as MISSING.
 * - Conflicting observations resolve in favour of the positive signal: a
 *   capability that was observed at least once is PRESENT, because the
 *   contradicting "absent" values carry no admissible weight (see above).
 */
@Injectable()
export class CompanyGapAnalysisService {
  build(bundle: CompanyEvidenceBundle, now: Date = new Date()): CompanyGapAnalysis {
    const website = this.evaluateWebsite(bundle);
    const booking = this.evaluateBooking(bundle);
    const contactCapture = this.evaluateContactCapture(bundle);
    const socialPresence = this.evaluateSocialPresence(bundle);
    const whatsapp = this.evaluateWhatsapp(bundle);
    const onlinePresence = this.deriveOnlinePresence([website, socialPresence, whatsapp, contactCapture]);
    const basicFoundation = this.deriveBasicDigitalFoundation(website);

    return {
      companyId: bundle.companyId,
      companyName: bundle.companyName,
      computedAt: now.toISOString(),
      gaps: [
        website,
        booking,
        contactCapture,
        socialPresence,
        whatsapp,
        onlinePresence,
        basicFoundation,
        ...NON_EVALUABLE_DIMENSIONS.map((dimension) =>
          unknown(dimension, GapReasonCode.DIMENSION_NOT_EVALUABLE, NOT_EVALUABLE_REASON),
        ),
      ],
    };
  }

  private evaluateWebsite(bundle: CompanyEvidenceBundle): GapResult {
    const references: GapEvidenceReference[] = [];

    for (const website of bundle.websites) {
      const normalized = normalizeWebsiteEvidence(website.domain ?? undefined);
      if (normalized === null) {
        continue;
      }
      references.push({
        source: GapEvidenceSource.CANONICAL_WEBSITE,
        field: 'website.domain',
        provider: nonEmpty(website.evidenceSource),
        url: nonEmpty(website.url) ?? normalized.url,
        observedAt: toIso(website.observedAt),
      });
    }

    for (const observation of bundle.observations) {
      const fetchedAt = toIso(observation.websiteCapabilities?.fetchedAt ?? null);
      if (fetchedAt === null) {
        continue;
      }
      references.push({
        source: GapEvidenceSource.SEARCH_RESULT_ENRICHMENT,
        field: 'website.fetchedAt',
        provider: nonEmpty(observation.websiteCapabilities?.provider),
        url: nonEmpty(observation.sourceUrl) ?? nonEmpty(observation.websiteDomain),
        observedAt: fetchedAt,
      });
    }

    if (references.length === 0) {
      return unknown(
        GapDimension.WEBSITE,
        GapReasonCode.NO_EVIDENCE_OBSERVED,
        'No website evidence was observed; the absence of a website record is not proof that the company has no website.',
      );
    }
    return present(
      GapDimension.WEBSITE,
      'A website was observed in canonical records or in a first-party website observation.',
      references,
    );
  }

  private evaluateBooking(bundle: CompanyEvidenceBundle): GapResult {
    const references = this.collectCapabilitySignals(bundle, 'website.bookingPageUrl', (capabilities) =>
      urlSignal(capabilities.bookingPageUrl),
    );
    if (references.length === 0) {
      return unknown(
        GapDimension.BOOKING,
        GapReasonCode.ABSENCE_NOT_ADMISSIBLE,
        `No online booking or appointment capability was observed. ${ABSENCE_LIMITATION}`,
      );
    }
    return present(
      GapDimension.BOOKING,
      'An online booking or appointment page was observed on the first-party website.',
      references,
    );
  }

  private evaluateContactCapture(bundle: CompanyEvidenceBundle): GapResult {
    const formSignals = this.collectCapabilitySignals(bundle, 'website.hasContactForm', (capabilities) =>
      capabilities.hasContactForm === true ? { url: null } : null,
    );
    const pageSignals = this.collectCapabilitySignals(bundle, 'website.contactPageUrl', (capabilities) =>
      urlSignal(capabilities.contactPageUrl),
    );
    const references = [...formSignals, ...pageSignals];
    if (references.length === 0) {
      return unknown(
        GapDimension.CONTACT_CAPTURE,
        GapReasonCode.ABSENCE_NOT_ADMISSIBLE,
        `No contact form or contact page was observed. ${ABSENCE_LIMITATION}`,
      );
    }
    return present(
      GapDimension.CONTACT_CAPTURE,
      'A contact form or contact page was observed on the first-party website.',
      references,
    );
  }

  private evaluateSocialPresence(bundle: CompanyEvidenceBundle): GapResult {
    const references: GapEvidenceReference[] = [];

    for (const profile of bundle.socialProfiles) {
      const url = nonEmpty(profile.profileUrl);
      const platform = nonEmpty(profile.platform);
      if (url === null && platform === null) {
        continue;
      }
      references.push({
        source: GapEvidenceSource.CANONICAL_SOCIAL_PROFILE,
        field: url === null ? 'socialProfile.platform' : 'socialProfile.profileUrl',
        provider: nonEmpty(profile.evidenceSource),
        url: url ?? nonEmpty(profile.evidenceUrl),
        observedAt: toIso(profile.observedAt),
      });
    }

    for (const observation of bundle.observations) {
      for (const check of observation.socialChecks) {
        const url = nonEmpty(check.profileUrl);
        if (url === null) {
          continue;
        }
        references.push({
          source: GapEvidenceSource.SEARCH_RESULT_ENRICHMENT,
          field: 'social.profileUrl',
          provider: null,
          url,
          observedAt: toIso(observation.retrievedAt),
        });
      }
    }

    if (references.length === 0) {
      return unknown(
        GapDimension.SOCIAL_PRESENCE,
        GapReasonCode.ABSENCE_NOT_ADMISSIBLE,
        'No social profile was observed; a failed or missing social discovery check is not proof that no profile exists.',
      );
    }
    return present(GapDimension.SOCIAL_PRESENCE, 'At least one social profile was observed.', references);
  }

  private evaluateWhatsapp(bundle: CompanyEvidenceBundle): GapResult {
    const references = this.collectCapabilitySignals(bundle, 'website.whatsappUrl', (capabilities) =>
      urlSignal(capabilities.whatsappUrl),
    );
    if (references.length === 0) {
      return unknown(
        GapDimension.WHATSAPP,
        GapReasonCode.ABSENCE_NOT_ADMISSIBLE,
        `No WhatsApp contact was observed. ${ABSENCE_LIMITATION}`,
      );
    }
    return present(
      GapDimension.WHATSAPP,
      'A WhatsApp contact link was observed on the first-party website.',
      references,
    );
  }

  /**
   * Collects one positive capability signal per observation. The selector
   * returns null when the signal was not observed, so negative or empty
   * persisted values never become evidence.
   */
  private collectCapabilitySignals(
    bundle: CompanyEvidenceBundle,
    field: string,
    select: (capabilities: WebsiteCapabilityObservation, observation: CompanyObservationInput) => ObservedSignal | null,
  ): GapEvidenceReference[] {
    const references: GapEvidenceReference[] = [];
    for (const observation of bundle.observations) {
      const capabilities = observation.websiteCapabilities;
      if (capabilities === null || capabilities === undefined) {
        continue;
      }
      const signal = select(capabilities, observation);
      if (signal === null) {
        continue;
      }
      references.push({
        source: GapEvidenceSource.SEARCH_RESULT_ENRICHMENT,
        field,
        provider: nonEmpty(capabilities.provider),
        url: signal.url ?? nonEmpty(observation.sourceUrl) ?? nonEmpty(observation.websiteDomain),
        observedAt: toIso(capabilities.fetchedAt) ?? toIso(observation.retrievedAt),
      });
    }
    return references;
  }

  private deriveOnlinePresence(sources: readonly GapResult[]): GapResult {
    const evidence = sources.flatMap((source) => source.evidence);
    if (evidence.length === 0) {
      return unknown(
        GapDimension.ONLINE_PRESENCE,
        GapReasonCode.DERIVED_FROM_PARENT,
        'No online channel was observed, so overall online presence cannot be determined.',
      );
    }
    const dimensions = sources
      .filter((source) => source.state === GapState.PRESENT)
      .map((source) => source.dimension)
      .join(', ');
    return {
      dimension: GapDimension.ONLINE_PRESENCE,
      state: GapState.PRESENT,
      reasonCode: GapReasonCode.DERIVED_FROM_PARENT,
      reason: `At least one online channel was observed (${dimensions}).`,
      evidence: normalizeEvidence(evidence),
    };
  }

  private deriveBasicDigitalFoundation(website: GapResult): GapResult {
    if (website.state === GapState.PRESENT) {
      return {
        dimension: GapDimension.BASIC_DIGITAL_FOUNDATION,
        state: GapState.PRESENT,
        reasonCode: GapReasonCode.DERIVED_FROM_PARENT,
        reason: 'A first-party website was observed, which establishes the basic digital foundation.',
        evidence: website.evidence,
      };
    }
    if (website.state === GapState.NOT_APPLICABLE) {
      return {
        dimension: GapDimension.BASIC_DIGITAL_FOUNDATION,
        state: GapState.NOT_APPLICABLE,
        reasonCode: GapReasonCode.DERIVED_FROM_PARENT,
        reason: 'Website capability is not applicable, so no basic digital foundation is expected.',
        evidence: [],
      };
    }
    return {
      dimension: GapDimension.BASIC_DIGITAL_FOUNDATION,
      state: GapState.UNKNOWN,
      reasonCode: GapReasonCode.DERIVED_FROM_PARENT,
      reason: 'Digital foundation follows the website dimension, which has no admissible evidence either way.',
      evidence: [],
    };
  }
}
