import type {
  ContactPromotionEvidence,
  PromotionStatus,
  SocialPromotionEvidence,
  WebsitePromotionEvidence,
} from '../entities/canonical-evidence.js';

export const CanonicalPromotionRepository = Symbol('CanonicalPromotionRepository');

export interface PromotionResult {
  status: PromotionStatus;
}

/**
 * Promotes observed evidence into canonical Company-owned facts
 * (Website/ContactMethod/SocialProfile + their company link rows).
 *
 * Implementations MUST be idempotent under concurrency: the DB partial unique
 * indexes (uq_websites_domain_active, uq_contact_methods_type_value_active,
 * uq_social_profiles_platform_url_active) are the authority, targeted via the
 * native ON CONFLICT pattern. Repeated or concurrent promotion of the same
 * observed fact must not create duplicate active canonical rows.
 */
export interface CanonicalPromotionRepository {
  promoteWebsite(companyId: string, promotion: WebsitePromotionEvidence): Promise<PromotionResult>;
  promoteContactMethod(companyId: string, promotion: ContactPromotionEvidence): Promise<PromotionResult>;
  promoteSocialProfile(companyId: string, promotion: SocialPromotionEvidence): Promise<PromotionResult>;
}
