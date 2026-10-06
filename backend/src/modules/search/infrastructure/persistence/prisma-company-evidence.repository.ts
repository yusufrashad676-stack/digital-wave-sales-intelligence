import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma/prisma.service.js';
import {
  CompanyEvidenceBundle,
  CompanyObservationInput,
  WebsiteCapabilityObservation,
  WebsiteHttpObservation,
} from '../../domain/entities/company-intelligence.js';
import { CompanyEvidenceRepository } from '../../domain/ports/company-evidence.repository.js';

const PHONE_TYPE_CODE = 'phone';
const EMAIL_TYPE_CODE = 'email';

/**
 * Loads every persisted evidence record a company owns so the intelligence
 * service can classify each factual dimension. Read-only; never mutates.
 *
 * Soft-deleted rows are excluded at every level (company, link rows, canonical
 * rows, observations). Enrichment snapshots are parsed defensively — malformed
 * JSON degrades to "no website check / no social checks observed", never a
 * throw.
 */
@Injectable()
export class PrismaCompanyEvidenceRepository implements CompanyEvidenceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async loadCompanyEvidence(companyId: string): Promise<CompanyEvidenceBundle | null> {
    const row = await this.prisma.client.company.findFirst({
      where: { id: companyId, deletedAt: null },
      select: {
        name: true,
        companyWebsites: {
          where: { deletedAt: null, website: { deletedAt: null } },
          select: {
            website: {
              select: {
                domain: true,
                url: true,
                evidenceSource: true,
                evidenceUrl: true,
                observedAt: true,
              },
            },
          },
        },
        companyContactMethods: {
          where: { deletedAt: null, contactMethod: { deletedAt: null } },
          select: {
            contactMethod: {
              select: {
                value: true,
                countryCode: true,
                evidenceSource: true,
                evidenceUrl: true,
                observedAt: true,
                type: { select: { code: true } },
              },
            },
          },
        },
        companySocialProfiles: {
          where: { deletedAt: null, socialProfile: { deletedAt: null } },
          select: {
            socialProfile: {
              select: {
                handle: true,
                profileUrl: true,
                evidenceSource: true,
                evidenceUrl: true,
                observedAt: true,
                platform: { select: { code: true } },
              },
            },
          },
        },
        searchResults: {
          where: { deletedAt: null },
          select: {
            providerId: true,
            retrievedAt: true,
            sourceUrl: true,
            websiteDomain: true,
            latitude: true,
            longitude: true,
            formattedAddress: true,
            enrichmentSnapshot: true,
            rating: true,
            ratingCount: true,
            category: true,
            area: true,
            verificationStatus: true,
          },
        },
      },
    });

    if (row === null) {
      return null;
    }

    const observations = row.searchResults.map(mapObservation);
    const locations = row.searchResults
      .filter(
        (observed) => observed.latitude !== null || observed.longitude !== null || observed.formattedAddress !== null,
      )
      .map((observed) => ({
        formattedAddress: observed.formattedAddress,
        latitude: observed.latitude,
        longitude: observed.longitude,
        city: null,
        region: null,
        countryCode: null,
        evidenceSource: observed.providerId,
        evidenceUrl: observed.sourceUrl,
        observedAt: observed.retrievedAt,
      }));

    return {
      companyId,
      companyName: row.name,
      websites: row.companyWebsites.map((link) => ({
        domain: link.website.domain,
        url: link.website.url,
        evidenceSource: link.website.evidenceSource,
        evidenceUrl: link.website.evidenceUrl,
        observedAt: link.website.observedAt,
      })),
      phones: row.companyContactMethods
        .filter((link) => link.contactMethod.type.code === PHONE_TYPE_CODE)
        .map((link) => ({
          value: link.contactMethod.value,
          countryCode: link.contactMethod.countryCode,
          evidenceSource: link.contactMethod.evidenceSource,
          evidenceUrl: link.contactMethod.evidenceUrl,
          observedAt: link.contactMethod.observedAt,
        })),
      emails: row.companyContactMethods
        .filter((link) => link.contactMethod.type.code === EMAIL_TYPE_CODE)
        .map((link) => ({
          value: link.contactMethod.value,
          evidenceSource: link.contactMethod.evidenceSource,
          evidenceUrl: link.contactMethod.evidenceUrl,
          observedAt: link.contactMethod.observedAt,
        })),
      socialProfiles: row.companySocialProfiles.map((link) => ({
        platform: link.socialProfile.platform.code,
        handle: link.socialProfile.handle,
        profileUrl: link.socialProfile.profileUrl,
        evidenceSource: link.socialProfile.evidenceSource,
        evidenceUrl: link.socialProfile.evidenceUrl,
        observedAt: link.socialProfile.observedAt,
      })),
      locations,
      observations,
    };
  }
}

function mapObservation(observed: {
  providerId: string;
  retrievedAt: Date;
  sourceUrl: string | null;
  websiteDomain: string | null;
  latitude: number | null;
  longitude: number | null;
  formattedAddress: string | null;
  enrichmentSnapshot: unknown;
  rating?: number | null;
  ratingCount?: number | null;
  category?: string | null;
  area?: string | null;
  verificationStatus?: string | null;
}): CompanyObservationInput {
  const snapshot = parseSnapshot(observed.enrichmentSnapshot);

  return {
    retrievedAt: observed.retrievedAt,
    sourceUrl: observed.sourceUrl,
    websiteDomain: observed.websiteDomain,
    latitude: observed.latitude,
    longitude: observed.longitude,
    formattedAddress: observed.formattedAddress,
    websiteCheckSucceeded: snapshot.website !== null && snapshot.capabilities?.bodyAnalyzed === true,
    websiteCheckFailed: snapshot.websiteErrors.length > 0,
    websiteFetchedAt: snapshot.website?.fetchedAt ?? null,
    websiteCapabilities: snapshot.capabilities,
    websiteHttp: snapshot.websiteHttp,
    commercial: {
      rating: observed.rating ?? null,
      ratingCount: observed.ratingCount ?? null,
      category: observed.category ?? null,
      area: observed.area ?? null,
      verificationStatus: observed.verificationStatus ?? null,
    },
    socialChecks:
      snapshot.socialProfiles?.map((profile) => ({
        platform: profile.platform,
        profileUrl: profile.profileUrl,
        verified: profile.verified,
      })) ?? [],
  };
}

interface ParsedSnapshot {
  website: { fetchedAt: string; provider: string | null } | null;
  websiteErrors: Array<{ type: string }>;
  socialProfiles: Array<{ platform: string; profileUrl: string; verified: boolean }>;
  capabilities: WebsiteCapabilityObservation | null;
  websiteHttp: WebsiteHttpObservation | null;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function optionalBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

/**
 * A persisted R6.2 HTTP status is admissible only when it is a whole number in
 * the HTTP status range (100..599). Anything else maps to null (unknown).
 */
function optionalHttpStatus(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return null;
  }
  return value >= 100 && value <= 599 ? value : null;
}

function parseCapabilities(website: Record<string, unknown> | null): WebsiteCapabilityObservation | null {
  if (website === null) {
    return null;
  }
  return {
    provider: optionalString(website.provider),
    fetchedAt: optionalString(website.fetchedAt),
    bodyAnalyzed: optionalBoolean(website.bodyAnalyzed),
    reachable: optionalBoolean(website.reachable),
    https: optionalBoolean(website.https),
    contactPageUrl: optionalString(website.contactPageUrl),
    hasContactForm: optionalBoolean(website.hasContactForm),
    bookingPageUrl: optionalString(website.bookingPageUrl),
    whatsappUrl: optionalString(website.whatsappUrl),
  };
}

/**
 * Parses the R6.2 root-website HTTP observation from a snapshot. Returns null
 * when the snapshot is absent or carries no R6.2 HTTP fields (historical); it
 * never synthesizes status, final URL, or same-origin from other fields.
 */
function parseHttpObservation(website: Record<string, unknown> | null): WebsiteHttpObservation | null {
  if (website === null) {
    return null;
  }
  const httpStatus = optionalHttpStatus(website.httpStatus);
  const httpRedirected = optionalBoolean(website.httpRedirected);
  const httpFinalUrl = optionalString(website.httpFinalUrl);
  const httpFinalSameOrigin = optionalBoolean(website.httpFinalSameOrigin);
  if (httpStatus === null && httpRedirected === null && httpFinalUrl === null && httpFinalSameOrigin === null) {
    return null;
  }
  return { httpStatus, httpRedirected, httpFinalUrl, httpFinalSameOrigin };
}

/**
 * Defensive parse of the JSON enrichment snapshot. Returns a safe shape; an
 * unparseable snapshot is treated as "no enrichment observed".
 */
function parseSnapshot(raw: unknown): ParsedSnapshot {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { website: null, websiteErrors: [], socialProfiles: [], capabilities: null, websiteHttp: null };
  }

  const record = raw as Record<string, unknown>;
  const website = record.website;
  const websiteRecord = typeof website === 'object' && website !== null ? (website as Record<string, unknown>) : null;
  const websiteFetchedAt = websiteRecord === null ? undefined : websiteRecord.fetchedAt;

  const errors = Array.isArray(record.errors) ? (record.errors as unknown[]) : [];
  const websiteErrors = errors
    .filter((error): error is Record<string, unknown> => typeof error === 'object' && error !== null)
    .filter((error) => error.type === 'website')
    .map((error) => ({ type: String(error.type) }));

  const social = record.social;
  const profiles =
    typeof social === 'object' && social !== null && Array.isArray((social as Record<string, unknown>).profiles)
      ? ((social as Record<string, unknown>).profiles as unknown[])
      : [];

  return {
    website:
      websiteFetchedAt !== undefined && typeof websiteFetchedAt === 'string'
        ? { fetchedAt: websiteFetchedAt, provider: optionalString(websiteRecord?.provider) }
        : null,
    websiteErrors,
    socialProfiles: profiles
      .filter((profile): profile is Record<string, unknown> => typeof profile === 'object' && profile !== null)
      .map((profile) => ({
        platform: typeof profile.platform === 'string' ? profile.platform : '',
        profileUrl: typeof profile.profileUrl === 'string' ? profile.profileUrl : '',
        verified: profile.verified === true,
      })),
    capabilities: parseCapabilities(websiteRecord),
    websiteHttp: parseHttpObservation(websiteRecord),
  };
}
