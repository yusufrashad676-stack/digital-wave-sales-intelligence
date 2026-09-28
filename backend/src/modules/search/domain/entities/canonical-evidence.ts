/**
 * Domain types + pure normalization for canonical evidence promotion.
 *
 * Canonical facts (Company → Website / ContactMethod / SocialProfile) are
 * promoted ONLY from facts actually observed in fetched/provided content. The
 * value normalization here is deliberately conservative: never guess, never
 * fabricate (no invented country codes, no inferred email addresses).
 *
 * This module has no framework or persistence dependencies.
 */

export interface WebsitePromotionEvidence {
  domain: string;
  url?: string | null;
  title?: string | null;
  description?: string | null;
  techHints?: string[];
  evidenceSource?: string | null;
  evidenceUrl?: string | null;
  observedAt?: Date | null;
}

export interface ContactPromotionEvidence {
  type: 'phone' | 'email';
  value: string;
  countryCode?: string | null;
  evidenceSource?: string | null;
  evidenceUrl?: string | null;
  observedAt?: Date | null;
}

export interface SocialPromotionEvidence {
  platform: string;
  handle?: string | null;
  profileUrl: string;
  evidenceSource?: string | null;
  evidenceUrl?: string | null;
  observedAt?: Date | null;
}

/**
 * Outcome of a single canonical promotion attempt.
 * - CREATED: a new active canonical row was inserted and linked.
 * - LINKED: the canonical row already existed and the company link is present.
 * - ALREADY_OWNED: the canonical row exists but is owned by another company
 *   (ADR-006 single-owner semantics); this company was not linked.
 */
export type PromotionStatus = 'CREATED' | 'LINKED' | 'ALREADY_OWNED';

export function normalizeText(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > 0 ? normalized : null;
}

/**
 * Normalize an observed phone number deterministically. Digits and a leading
 * '+' are kept; a '00' dial prefix becomes '+'. No country code is ever
 * invented — an unchanged local number stays local.
 */
export function normalizePhone(value: string | undefined): string | null {
  const normalized = normalizeText(value);
  if (normalized === null) {
    return null;
  }
  const digits = normalized.replace(/[^\d+]/g, '');
  if (digits.length === 0) {
    return null;
  }
  return digits.startsWith('+') ? digits : digits.replace(/^00/, '+');
}

export function normalizeWebsite(value: string | undefined): string | null {
  const normalized = normalizeText(value);
  if (normalized === null) {
    return null;
  }
  try {
    const withProtocol = normalized.includes('://') ? normalized : `https://${normalized}`;
    const url = new URL(withProtocol);
    return url.hostname.length > 0 ? `https://${url.hostname.toLowerCase()}` : null;
  } catch {
    return null;
  }
}

const EMAIL_PATTERN =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

/**
 * Normalize an observed email address. Only syntactic validation + lowercasing;
 * it does not prove delivery. Null when the value is missing or invalid — the
 * caller must treat null as "not observable", never as "no email".
 */
export function normalizeEmail(value: string | undefined): string | null {
  const normalized = normalizeText(value);
  if (normalized === null || normalized.length > 254) {
    return null;
  }
  const candidate = normalized.toLowerCase();
  return EMAIL_PATTERN.test(candidate) ? candidate : null;
}

/**
 * Normalize an observed website reference into `{ domain, url }` for the
 * canonical Website row. Null when not parseable — never a fabricated domain.
 */
export function normalizeWebsiteEvidence(value: string | undefined): { domain: string; url: string } | null {
  const normalized = normalizeWebsite(value);
  if (normalized === null) {
    return null;
  }
  try {
    const url = new URL(normalized);
    return { domain: url.hostname, url: normalized };
  } catch {
    return null;
  }
}

/**
 * Validate a provider-supplied coordinate. Returns null for non-finite values
 * or out-of-range lat/lng (treat missing/absurd values as UNKNOWN).
 */
export function normalizeLatitude(value: number | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < -90 || value > 90) {
    return null;
  }
  return value;
}

export function normalizeLongitude(value: number | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < -180 || value > 180) {
    return null;
  }
  return value;
}
