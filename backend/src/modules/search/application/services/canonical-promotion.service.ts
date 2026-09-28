import { Inject, Injectable } from '@nestjs/common';
import type { EnrichmentSnapshot } from '../../domain/entities/enrichment-snapshot.js';
import { normalizeEmail, normalizePhone, normalizeWebsiteEvidence } from '../../domain/entities/canonical-evidence.js';
import {
  CanonicalPromotionRepository,
  type PromotionResult,
} from '../../domain/ports/canonical-promotion.repository.js';
import type { EnrichmentResultRow } from '../../domain/ports/enrichment.repository.js';

export interface PromotionSummary {
  website: PromotionResult | null;
  contacts: PromotionResult[];
  social: PromotionResult[];
}

/**
 * Builds canonical evidence strictly from facts OBSERVED during discovery or
 * enrichment, then promotes them into Company-owned canonical rows.
 *
 * Rules enforced here:
 * - Promote only observed values; never guess (no fabricated phone country
 *   codes, no inferred email addresses, no invented profile URLs).
 * - Emails come from first-party fetched content (snapshot.website.emails);
 *   a missing email is UNKNOWN, never a negative claim.
 * - Phones come from the search provider result (already normalized).
 * - Social profiles come from the social discovery snapshot only.
 * - Provenance fields (source/url/observedAt) are populated only where real
 *   evidence parsing is available; unobservable values stay absent.
 */
@Injectable()
export class CanonicalPromotionService {
  constructor(@Inject(CanonicalPromotionRepository) private readonly repo: CanonicalPromotionRepository) {}

  async promoteFromEnrichment(row: EnrichmentResultRow, snapshot: EnrichmentSnapshot): Promise<PromotionSummary> {
    if (row.companyId === null) {
      return { website: null, contacts: [], social: [] };
    }

    const website = await this.promoteWebsite(row, snapshot);
    const contacts = await this.promoteContacts(row, snapshot);
    const social = await this.promoteSocial(row, snapshot);

    return { website, contacts, social };
  }

  private async promoteWebsite(
    row: EnrichmentResultRow,
    snapshot: EnrichmentSnapshot,
  ): Promise<PromotionResult | null> {
    if (row.websiteDomain === null || snapshot.website === undefined) {
      return null;
    }
    const evidence = normalizeWebsiteEvidence(`https://${row.websiteDomain}`);
    if (evidence === null) {
      return null;
    }
    return this.repo.promoteWebsite(row.companyId as string, {
      domain: evidence.domain,
      url: evidence.url,
      title: snapshot.website.title,
      description: snapshot.website.description,
      techHints: snapshot.website.techHints,
      evidenceSource: snapshot.website.provider,
      evidenceUrl: evidence.url,
      observedAt: parseDate(snapshot.website.fetchedAt),
    });
  }

  private async promoteContacts(row: EnrichmentResultRow, snapshot: EnrichmentSnapshot): Promise<PromotionResult[]> {
    const results: PromotionResult[] = [];
    const evidenceUrl = row.websiteDomain === null ? (row.sourceUrl ?? null) : `https://${row.websiteDomain}`;
    const observedAt =
      snapshot.website?.fetchedAt !== undefined ? parseDate(snapshot.website.fetchedAt) : row.retrievedAt;
    const promotedEmails = new Set<string>();

    // Provider-observed phone (normalized during discovery).
    if (row.phone !== null && normalizePhone(row.phone) !== null) {
      results.push(
        await this.repo.promoteContactMethod(row.companyId as string, {
          type: 'phone',
          value: normalizePhone(row.phone) as string,
          countryCode: countryCodeOfPhone(row.phone),
          evidenceSource: row.providerId,
          evidenceUrl: row.sourceUrl ?? evidenceUrl,
          observedAt: row.retrievedAt,
        }),
      );
    }

    // Emails observed in first-party fetched content only.
    for (const raw of snapshot.website?.emails ?? []) {
      const email = normalizeEmail(raw);
      if (email === null || promotedEmails.has(email)) {
        continue;
      }
      promotedEmails.add(email);
      results.push(
        await this.repo.promoteContactMethod(row.companyId as string, {
          type: 'email',
          value: email,
          evidenceSource: snapshot.website?.provider ?? row.providerId,
          evidenceUrl,
          observedAt,
        }),
      );
    }

    // Provider-observed email (directly supplied by the search provider).
    if (row.email !== null) {
      const email = normalizeEmail(row.email);
      if (email !== null && !promotedEmails.has(email)) {
        promotedEmails.add(email);
        results.push(
          await this.repo.promoteContactMethod(row.companyId as string, {
            type: 'email',
            value: email,
            evidenceSource: row.providerId,
            evidenceUrl: row.sourceUrl ?? evidenceUrl,
            observedAt: row.retrievedAt,
          }),
        );
      }
    }

    return results;
  }

  private async promoteSocial(row: EnrichmentResultRow, snapshot: EnrichmentSnapshot): Promise<PromotionResult[]> {
    if (row.companyId === null || snapshot.social === undefined) {
      return [];
    }

    const results: PromotionResult[] = [];
    for (const profile of snapshot.social.profiles) {
      if (profile.platform === '' || profile.profileUrl === '') {
        continue;
      }
      results.push(
        await this.repo.promoteSocialProfile(row.companyId as string, {
          platform: profile.platform,
          handle: profile.handle,
          profileUrl: profile.profileUrl,
          evidenceSource: snapshot.social.provider,
          evidenceUrl: profile.profileUrl,
          observedAt: parseDate(snapshot.social.discoveredAt),
        }),
      );
    }
    return results;
  }
}

/**
 * Derive an OBSERVED international country code from a normalized phone when it
 * carries the '+' prefix. Never fabricates one for a purely local number.
 */
function countryCodeOfPhone(phone: string): string | undefined {
  const normalized = normalizePhone(phone);
  if (normalized === null || !normalized.startsWith('+')) {
    return undefined;
  }
  const digits = normalized.slice(1);
  const candidate = digits.startsWith('20') ? digits.slice(0, 2) : digits.slice(0, 3);
  return `+${candidate}`;
}

function parseDate(value: string | Date | undefined | null): Date | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}
