export type VerificationStatus = 'VERIFIED' | 'UNVERIFIED' | 'UNKNOWN';

export class NormalizedSearchResult {
  constructor(
    public readonly providerId: string,
    public readonly providerRecordId: string,
    public readonly companyName: string,
    public readonly category: string | null,
    public readonly address: string | null,
    public readonly phone: string | null,
    public readonly website: string | null,
    public readonly rating: number | null,
    public readonly ratingCount: number | null,
    public readonly verificationStatus: VerificationStatus,
    public readonly sourceUrl: string | null,
    public readonly retrievedAt: Date,
    public readonly area: string | null = null,
    public readonly latitude: number | null = null,
    public readonly longitude: number | null = null,
  ) {}
}
