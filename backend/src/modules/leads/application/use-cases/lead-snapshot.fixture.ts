import type { LeadSnapshot } from '../../domain/entities/lead.entity.js';

export function leadSnapshot(overrides: Partial<LeadSnapshot> = {}): LeadSnapshot {
  return {
    id: 'lead-1',
    userId: 'user-1',
    status: 'NEW',
    notes: null,
    providerId: 'mock',
    providerRecordId: 'mock-restaurant-003',
    companyName: 'مطعم أبو قير للمأكولات البحرية',
    category: 'restaurant',
    area: 'سيدي بشر',
    address: 'سيدي بشر، طريق الجيش، الإسكندرية',
    phone: '+20 3 540 2233',
    email: null,
    website: 'https://abuqir-seafood.example.com',
    rating: 4.3,
    ratingCount: 431,
    verificationStatus: 'UNVERIFIED',
    sourceUrl: null,
    retrievedAt: '2026-08-15T10:00:00.000Z',
    savedAt: '2026-08-15T10:05:00.000Z',
    createdAt: '2026-08-15T10:05:00.000Z',
    updatedAt: '2026-08-15T10:05:00.000Z',
    ...overrides,
  };
}
