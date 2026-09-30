import { Injectable } from '@nestjs/common';
import {
  normalizeEmail,
  normalizeLatitude,
  normalizeLongitude,
  normalizePhone,
  normalizeWebsiteEvidence,
} from '../../domain/entities/canonical-evidence.js';
import {
  CompanyEvidenceBundle,
  CompanyIntelligenceSummary,
  DataQualityReport,
  EvidenceState,
  FactVerification,
  FactualDimension,
  FreshnessDimensionReport,
  ProvenanceDimensionReport,
  ValidityDimensionReport,
  WebsiteCheckState,
} from '../../domain/entities/company-intelligence.js';

const ALL_DIMENSIONS: readonly FactualDimension[] = [
  FactualDimension.WEBSITE,
  FactualDimension.PHONE,
  FactualDimension.EMAIL,
  FactualDimension.SOCIAL,
  FactualDimension.LOCATION,
];

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

function latestIso(values: ReadonlyArray<string | null>): string | null {
  let latest: string | null = null;
  for (const value of values) {
    if (value !== null && (latest === null || value > latest)) {
      latest = value;
    }
  }
  return latest;
}

function hasProvenance(source: string | null | undefined, url: string | null | undefined): boolean {
  return Boolean(source?.trim()) || Boolean(url?.trim());
}

function firstPartyReason(source: string | null | undefined): string {
  return source === 'http-website-enrichment'
    ? 'Observed on first-party website content.'
    : 'Observed via external provider.';
}

function distinctSorted(values: ReadonlyArray<string>): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

interface WebsiteCheckFacet {
  state: WebsiteCheckState;
  fetchedAt: string | null;
  reasons: string[];
}

@Injectable()
export class CompanyIntelligenceService {
  build(bundle: CompanyEvidenceBundle, now: Date = new Date()): CompanyIntelligenceSummary {
    const website = this.verifyWebsite(bundle);
    const phone = this.verifyPhone(bundle);
    const email = this.verifyEmail(bundle);
    const social = this.verifySocial(bundle);
    const location = this.verifyLocation(bundle);

    const dimensions: Record<FactualDimension, FactVerification> = {
      [FactualDimension.WEBSITE]: website,
      [FactualDimension.PHONE]: phone,
      [FactualDimension.EMAIL]: email,
      [FactualDimension.SOCIAL]: social,
      [FactualDimension.LOCATION]: location,
    };

    return {
      companyId: bundle.companyId,
      companyName: bundle.companyName,
      computedAt: now.toISOString(),
      dimensions,
      quality: this.assessQuality(bundle, dimensions, now),
    };
  }

  private verifyWebsite(bundle: CompanyEvidenceBundle): FactVerification {
    const normalized = bundle.websites
      .map((website) => normalizeWebsiteEvidence(website.domain ?? undefined))
      .filter((entry): entry is { domain: string; url: string } => entry !== null);
    const domains = distinctSorted(normalized.map((entry) => entry.domain));

    if (domains.length === 0) {
      return {
        dimension: FactualDimension.WEBSITE,
        state: EvidenceState.UNKNOWN,
        value: null,
        count: 0,
        observedAt: null,
        reasons: ['No website evidence observed.'],
      };
    }

    const conflicting = domains.length >= 2;
    const check = this.inspectWebsiteCheck(bundle, domains);
    const observedAt = latestIso([...bundle.websites.map((website) => toIso(website.observedAt)), check.fetchedAt]);

    const reasons: string[] = [];
    if (conflicting) {
      reasons.push(
        `Two or more distinct canonical domains observe the single-valued website property: ${domains.join(', ')}.`,
      );
    } else {
      const singleDomain = domains[0];
      if (singleDomain !== undefined) {
        reasons.push(`Website observed with canonical domain ${singleDomain}.`);
      }
      const provenance = bundle.websites.filter((website) =>
        hasProvenance(website.evidenceSource, website.evidenceUrl),
      );
      if (provenance.length > 0 && provenance[0] !== undefined) {
        reasons.push(firstPartyReason(provenance[0].evidenceSource));
      }
      if (check.state === WebsiteCheckState.SUCCESS) {
        reasons.push('Website check passed: page fetched successfully.');
      }
      reasons.push(...check.reasons);
    }

    let state: EvidenceState;
    if (conflicting) {
      state = EvidenceState.CONFLICTED;
    } else if (check.state === WebsiteCheckState.SUCCESS) {
      state = EvidenceState.VERIFIED;
    } else {
      state = EvidenceState.OBSERVED;
    }

    return {
      dimension: FactualDimension.WEBSITE,
      state,
      value: conflicting ? domains.join(', ') : (domains[0] ?? null),
      count: domains.length,
      observedAt,
      reasons,
    };
  }

  private inspectWebsiteCheck(bundle: CompanyEvidenceBundle, domains: ReadonlyArray<string>): WebsiteCheckFacet {
    const matching = bundle.observations.filter((observation) => {
      const domain = normalizeWebsiteEvidence(observation.websiteDomain ?? undefined);
      return domain !== null && domains.includes(domain.domain);
    });

    const succeeded = matching.find((observation) => observation.websiteCheckSucceeded);
    const failed = matching.find((observation) => observation.websiteCheckFailed);

    if (succeeded) {
      return {
        state: WebsiteCheckState.SUCCESS,
        fetchedAt: toIso(succeeded.websiteFetchedAt),
        reasons: ['Website check passed: page fetched successfully.'],
      };
    }
    if (failed) {
      return {
        state: WebsiteCheckState.FAILED,
        fetchedAt: null,
        reasons: ['Website check failed (timeout/network/robots) — a failed fetch is not evidence of absence.'],
      };
    }
    return {
      state: WebsiteCheckState.UNKNOWN,
      fetchedAt: null,
      reasons: ['No website check outcome observed yet.'],
    };
  }

  private verifyPhone(bundle: CompanyEvidenceBundle): FactVerification {
    if (bundle.phones.length === 0) {
      return {
        dimension: FactualDimension.PHONE,
        state: EvidenceState.UNKNOWN,
        value: null,
        count: 0,
        observedAt: null,
        reasons: ['No phone evidence observed.'],
      };
    }

    const normalizedValues = bundle.phones
      .map((phone) => ({ value: normalizePhone(phone.value), evidence: phone }))
      .map(({ value, evidence }) => ({ value, evidence }));
    const valid = normalizedValues.filter(
      (entry): entry is { value: string; evidence: (typeof bundle.phones)[number] } => entry.value !== null,
    );
    const invalidCount = bundle.phones.length - valid.length;

    if (valid.length === 0) {
      return {
        dimension: FactualDimension.PHONE,
        state: EvidenceState.FAILED,
        value: null,
        count: bundle.phones.length,
        observedAt: latestIso(bundle.phones.map((phone) => toIso(phone.observedAt))),
        reasons: ['Observed phone value(s) fail normalization (invalid format).'],
      };
    }

    const values = distinctSorted(valid.map((entry) => entry.value));
    const withProvenance = valid.filter((entry) =>
      hasProvenance(entry.evidence.evidenceSource, entry.evidence.evidenceUrl),
    );
    const observedAt = latestIso(valid.map((entry) => toIso(entry.evidence.observedAt)));
    const verified = withProvenance.length > 0 && observedAt !== null;

    const reasons: string[] = [`Phone observed: ${values[0]}.`];
    if (verified && withProvenance[0] !== undefined) {
      reasons.push(firstPartyReason(withProvenance[0].evidence.evidenceSource));
      reasons.push(`Observed at ${observedAt}.`);
    } else {
      reasons.push('Phone observed without corroborating provenance.');
    }
    if (values.length > 1) {
      reasons.push(`${values.length} phone values observed; phones are multi-valued, so no conflict applies.`);
    }
    if (invalidCount > 0) {
      reasons.push(`${invalidCount} phone value(s) ignored as invalid.`);
    }

    return {
      dimension: FactualDimension.PHONE,
      state: verified ? EvidenceState.VERIFIED : EvidenceState.OBSERVED,
      value: values[0] ?? null,
      count: values.length,
      observedAt,
      reasons,
    };
  }

  private verifyEmail(bundle: CompanyEvidenceBundle): FactVerification {
    if (bundle.emails.length === 0) {
      return {
        dimension: FactualDimension.EMAIL,
        state: EvidenceState.UNKNOWN,
        value: null,
        count: 0,
        observedAt: null,
        reasons: ['No email evidence observed.'],
      };
    }

    const normalized = bundle.emails.map((email) => ({ value: normalizeEmail(email.value), email }));
    const valid = normalized.filter(
      (entry): entry is { value: string; email: (typeof bundle.emails)[number] } => entry.value !== null,
    );

    const allInvalid = valid.length === 0;
    if (allInvalid) {
      return {
        dimension: FactualDimension.EMAIL,
        state: EvidenceState.FAILED,
        value: null,
        count: bundle.emails.length,
        observedAt: latestIso(bundle.emails.map((email) => toIso(email.observedAt))),
        reasons: ['Observed email value(s) fail syntactic validation.'],
      };
    }

    const values = distinctSorted(valid.map((entry) => entry.value));
    const withProvenance = valid.filter((entry) => hasProvenance(entry.email.evidenceSource, entry.email.evidenceUrl));
    const observedAt = latestIso(valid.map((entry) => toIso(entry.email.observedAt)));
    const verified = withProvenance.length > 0 && observedAt !== null;

    const reasons: string[] = [`Email observed: ${values[0]}.`];
    reasons.push('Syntactically valid.');
    if (verified && withProvenance[0] !== undefined) {
      reasons.push(firstPartyReason(withProvenance[0].email.evidenceSource));
      reasons.push(`Observed at ${observedAt}.`);
    } else {
      reasons.push('Email observed without corroborating provenance.');
    }
    if (values.length > 1) {
      reasons.push(`${values.length} email values observed; emails are multi-valued, so no conflict applies.`);
    }

    return {
      dimension: FactualDimension.EMAIL,
      state: verified ? EvidenceState.VERIFIED : EvidenceState.OBSERVED,
      value: values[0] ?? null,
      count: values.length,
      observedAt,
      reasons,
    };
  }

  private verifySocial(bundle: CompanyEvidenceBundle): FactVerification {
    if (bundle.socialProfiles.length === 0) {
      return {
        dimension: FactualDimension.SOCIAL,
        state: EvidenceState.UNKNOWN,
        value: null,
        count: 0,
        observedAt: null,
        reasons: ['No social profile evidence observed.'],
      };
    }

    const profiles = bundle.socialProfiles
      .map((profile) => normalizeWebsiteEvidence(profile.profileUrl ?? undefined))
      .filter((entry): entry is { domain: string; url: string } => entry !== null);
    const urls = distinctSorted(profiles.map((entry) => entry.url));

    const verifiedMatch = bundle.socialProfiles.some((profile) =>
      bundle.observations.some((observation) =>
        observation.socialChecks.some(
          (check) =>
            check.verified === true &&
            check.profileUrl !== null &&
            profile.profileUrl !== null &&
            profile.profileUrl.trim().toLowerCase() === check.profileUrl.trim().toLowerCase() &&
            (check.platform === null ||
              profile.platform === null ||
              check.platform.trim().toLowerCase() === profile.platform.trim().toLowerCase()),
        ),
      ),
    );

    const withProvenance = bundle.socialProfiles.filter((profile) =>
      hasProvenance(profile.evidenceSource, profile.evidenceUrl),
    );
    const observedAt = latestIso(bundle.socialProfiles.map((profile) => toIso(profile.observedAt)));

    const reasons: string[] = [];
    const firstUrl = urls[0] ?? null;
    if (firstUrl === null && profiles.length === 0) {
      reasons.push('Social profile(s) observed without a parseable profile URL.');
    } else if (firstUrl !== null) {
      reasons.push(`Social profile observed: ${firstUrl}.`);
    } else {
      reasons.push('Social profile(s) observed without a parseable profile URL.');
    }
    if (verifiedMatch) {
      reasons.push('Profile reported active by social verification provider.');
    } else {
      reasons.push('No positive social verification outcome observed yet.');
    }
    if (withProvenance.length > 0 && withProvenance[0] !== undefined) {
      reasons.push(firstPartyReason(withProvenance[0].evidenceSource));
    }

    return {
      dimension: FactualDimension.SOCIAL,
      state: verifiedMatch ? EvidenceState.VERIFIED : EvidenceState.OBSERVED,
      value: firstUrl,
      count: bundle.socialProfiles.length,
      observedAt,
      reasons,
    };
  }

  private verifyLocation(bundle: CompanyEvidenceBundle): FactVerification {
    const units = bundle.locations
      .filter((location) => location.latitude !== null && location.longitude !== null)
      .map((location) => ({
        lat: location.latitude as number,
        lng: location.longitude as number,
        sourceUrl: location.evidenceUrl,
        observedAt: toIso(location.observedAt),
      }));

    const addressOnly = bundle.locations
      .map((location) => location.formattedAddress)
      .filter((value): value is string => Boolean(value?.trim()));

    const coordinateProvided = units.length > 0;
    const addressed = addressOnly.length > 0;

    if (!coordinateProvided && !addressed) {
      return {
        dimension: FactualDimension.LOCATION,
        state: EvidenceState.UNKNOWN,
        value: null,
        count: 0,
        observedAt: null,
        reasons: ['No location evidence observed.'],
      };
    }

    if (coordinateProvided) {
      const validUnits = units.filter(
        (unit) => normalizeLatitude(unit.lat) !== null && normalizeLongitude(unit.lng) !== null,
      );
      if (validUnits.length === 0) {
        return {
          dimension: FactualDimension.LOCATION,
          state: EvidenceState.FAILED,
          value: null,
          count: units.length,
          observedAt: latestIso(units.map((unit) => unit.observedAt)),
          reasons: ['Coordinates observed outside valid range (latitude/longitude).'],
        };
      }

      const sorted = [...validUnits].sort((a, b) => a.lat - b.lat || a.lng - b.lng);
      const primary = sorted[0];
      if (primary === undefined) {
        return {
          dimension: FactualDimension.LOCATION,
          state: EvidenceState.FAILED,
          value: null,
          count: units.length,
          observedAt: null,
          reasons: ['Coordinates observed could not be ordered deterministically.'],
        };
      }
      const value = `${primary.lat},${primary.lng}`;
      const withProvenance = validUnits.filter((unit) => hasProvenance(unit.sourceUrl, null));
      const observedAt = latestIso(validUnits.map((unit) => unit.observedAt));
      const verified = withProvenance.length > 0 && observedAt !== null;

      const reasons: string[] = [`Location observed via coordinates: ${value}.`];
      if (verified) {
        reasons.push(`Observed at ${observedAt}.`);
      } else {
        reasons.push('Location observed without corroborating provenance.');
      }
      if (addressed) {
        reasons.push(`${addressOnly.length} address snapshot(s) also observed.`);
      }

      return {
        dimension: FactualDimension.LOCATION,
        state: verified ? EvidenceState.VERIFIED : EvidenceState.OBSERVED,
        value,
        count: validUnits.length,
        observedAt,
        reasons,
      };
    }

    const values = distinctSorted(addressOnly);
    const observedAt = latestIso(
      bundle.locations
        .filter((location) => location.formattedAddress !== null)
        .map((location) => toIso(location.observedAt)),
    );

    return {
      dimension: FactualDimension.LOCATION,
      state: EvidenceState.OBSERVED,
      value: values[0] ?? null,
      count: values.length,
      observedAt,
      reasons: [`Location observed via address snapshot: ${values[0]}.`, 'No coordinates available.'],
    };
  }

  private assessQuality(
    bundle: CompanyEvidenceBundle,
    dimensions: Record<FactualDimension, FactVerification>,
    now: Date,
  ): DataQualityReport {
    const evidencedDimensions = ALL_DIMENSIONS.filter(
      (dimension) => dimensions[dimension].state !== EvidenceState.UNKNOWN,
    );
    const unknownDimensions = ALL_DIMENSIONS.filter(
      (dimension) => dimensions[dimension].state === EvidenceState.UNKNOWN,
    );

    const completenessDetails = evidencedDimensions.map(
      (dimension) =>
        `${dimension}: ${dimensions[dimension].state}${dimensions[dimension].count > 0 ? ` (${dimensions[dimension].count})` : ''}`,
    );
    if (unknownDimensions.length > 0) {
      completenessDetails.push(
        `evidenced ${evidencedDimensions.length} of ${ALL_DIMENSIONS.length}; unknown: ${unknownDimensions.join(', ')}`,
      );
    }

    const provenanceDimensions: ProvenanceDimensionReport[] = [
      {
        dimension: FactualDimension.WEBSITE,
        facts: bundle.websites.length,
        evidenced: bundle.websites.filter((website) => hasProvenance(website.evidenceSource, website.evidenceUrl))
          .length,
        evidenceless: bundle.websites.filter((website) => !hasProvenance(website.evidenceSource, website.evidenceUrl))
          .length,
      },
      {
        dimension: FactualDimension.PHONE,
        facts: bundle.phones.length,
        evidenced: bundle.phones.filter((phone) => hasProvenance(phone.evidenceSource, phone.evidenceUrl)).length,
        evidenceless: bundle.phones.filter((phone) => !hasProvenance(phone.evidenceSource, phone.evidenceUrl)).length,
      },
      {
        dimension: FactualDimension.EMAIL,
        facts: bundle.emails.length,
        evidenced: bundle.emails.filter((email) => hasProvenance(email.evidenceSource, email.evidenceUrl)).length,
        evidenceless: bundle.emails.filter((email) => !hasProvenance(email.evidenceSource, email.evidenceUrl)).length,
      },
      {
        dimension: FactualDimension.SOCIAL,
        facts: bundle.socialProfiles.length,
        evidenced: bundle.socialProfiles.filter((profile) => hasProvenance(profile.evidenceSource, profile.evidenceUrl))
          .length,
        evidenceless: bundle.socialProfiles.filter(
          (profile) => !hasProvenance(profile.evidenceSource, profile.evidenceUrl),
        ).length,
      },
      {
        dimension: FactualDimension.LOCATION,
        facts: bundle.locations.length,
        evidenced: bundle.locations.filter((location) => hasProvenance(location.evidenceUrl, location.formattedAddress))
          .length,
        evidenceless: bundle.locations.filter(
          (location) => !hasProvenance(location.evidenceUrl, location.formattedAddress),
        ).length,
      },
    ];
    const totalFacts = provenanceDimensions.reduce((sum, dimension) => sum + dimension.facts, 0);
    const totalEvidenced = provenanceDimensions.reduce((sum, dimension) => sum + dimension.evidenced, 0);

    const validityDimensions: ValidityDimensionReport[] = [
      {
        dimension: FactualDimension.WEBSITE,
        facts: bundle.websites.length,
        invalid: bundle.websites.filter((website) => normalizeWebsiteEvidence(website.domain ?? undefined) === null)
          .length,
        details: [],
      },
      {
        dimension: FactualDimension.PHONE,
        facts: bundle.phones.length,
        invalid: bundle.phones.filter((phone) => normalizePhone(phone.value) === null).length,
        details: [],
      },
      {
        dimension: FactualDimension.EMAIL,
        facts: bundle.emails.length,
        invalid: bundle.emails.filter((email) => normalizeEmail(email.value) === null).length,
        details: [],
      },
      {
        dimension: FactualDimension.SOCIAL,
        facts: bundle.socialProfiles.length,
        invalid: bundle.socialProfiles.filter(
          (profile) => normalizeWebsiteEvidence(profile.profileUrl ?? undefined) === null,
        ).length,
        details: [],
      },
      {
        dimension: FactualDimension.LOCATION,
        facts: bundle.locations.length,
        invalid: bundle.locations.filter(
          (location) =>
            (location.latitude !== null || location.longitude !== null) &&
            (normalizeLatitude(location.latitude ?? 0) === null ||
              normalizeLongitude(location.longitude ?? 0) === null),
        ).length,
        details: [],
      },
    ];
    const totalStructural = validityDimensions.reduce((sum, dimension) => sum + dimension.facts, 0);
    const totalInvalid = validityDimensions.reduce((sum, dimension) => sum + dimension.invalid, 0);

    const conflictingDimensions = ALL_DIMENSIONS.filter(
      (dimension) => dimensions[dimension].state === EvidenceState.CONFLICTED,
    );
    const consistencyDetails = conflictingDimensions.map(
      (dimension) => `${dimension}: ${dimensions[dimension].reasons.join(' ')}`,
    );

    const freshnessDimensions: FreshnessDimensionReport[] = ALL_DIMENSIONS.map((dimension) => {
      const fact = dimensions[dimension];
      const ageMs = fact.observedAt === null ? null : now.getTime() - new Date(fact.observedAt).getTime();
      return {
        dimension,
        facts: fact.count,
        observedAt: fact.observedAt,
        ageMs: ageMs !== null && Number.isNaN(ageMs) ? null : ageMs,
      };
    });
    const latestObservedAt = latestIso(freshnessDimensions.map((dimension) => dimension.observedAt));

    return {
      completeness: {
        evidenced: evidencedDimensions.length,
        unknown: unknownDimensions.length,
        dimensions: evidencedDimensions,
        fraction: evidencedDimensions.length / ALL_DIMENSIONS.length,
        details: completenessDetails.length > 0 ? completenessDetails : ['No dimension evidenced.'],
      },
      provenance: {
        total: totalFacts,
        evidenced: totalEvidenced,
        evidenceless: totalFacts - totalEvidenced,
        dimensions: provenanceDimensions,
        details: [`evidenced: ${totalEvidenced}; of ${totalFacts}`],
      },
      validity: {
        total: totalStructural,
        invalid: totalInvalid,
        dimensions: validityDimensions,
        details: [`invalid: ${totalInvalid}; of ${totalStructural}`],
      },
      consistency: {
        conflicting: conflictingDimensions.length,
        dimensions: conflictingDimensions,
        details: consistencyDetails.length > 0 ? consistencyDetails : ['No conflicting (single-valued) evidence.'],
      },
      freshness: {
        latestObservedAt,
        dimensions: freshnessDimensions,
        details: [
          latestObservedAt === null
            ? 'No observation timestamps available; freshness thresholds are a future policy decision.'
            : `latest observation: ${latestObservedAt}; freshness thresholds are a future policy decision.`,
        ],
      },
    };
  }
}
