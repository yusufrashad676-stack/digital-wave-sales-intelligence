import { Injectable } from '@nestjs/common';
import type { ProviderResultSet, ProviderSearchResult } from '../../domain/entities/provider-result.js';
import type { SearchQuery } from '../../domain/entities/search-query.js';
import type { SearchCapability, SearchProviderPort } from '../../domain/ports/search-provider.port.js';

interface SampleBusiness {
  providerRecordId: string;
  companyName: string;
  category: string;
  governorate: string;
  area: string;
  address: string;
  phone: string;
  website: string;
  rating: number;
  ratingCount: number;
  verificationStatus: 'VERIFIED' | 'UNVERIFIED';
}

const SAMPLE_BUSINESSES: SampleBusiness[] = [
  {
    providerRecordId: 'mock-clinic-001',
    companyName: 'عيادة د. أحمد عبد الله لطب الأسنان',
    category: 'dental-clinic',
    governorate: 'Cairo',
    area: 'التجمع الخامس',
    address: 'التجمع الخامس، شارع التسعين، القاهرة الجديدة',
    phone: '+20 100 123 4567',
    website: 'https://www.example-dental-ahmed.com',
    rating: 4.6,
    ratingCount: 128,
    verificationStatus: 'VERIFIED',
  },
  {
    providerRecordId: 'mock-clinic-002',
    companyName: 'عيادة المستقبل للجلدية والتجميل',
    category: 'clinic',
    governorate: 'Cairo',
    area: 'مصر الجديدة',
    address: 'مصر الجديدة، شارع الميرغني، القاهرة',
    phone: '+20 2 2690 5544',
    website: 'https://future-clinic.example.com',
    rating: 3.9,
    ratingCount: 84,
    verificationStatus: 'UNVERIFIED',
  },
  {
    providerRecordId: 'mock-clinic-003',
    companyName: 'مركز الأمل لطب الأسنان',
    category: 'dental-clinic',
    governorate: 'Cairo',
    area: 'مدينة نصر',
    address: 'مدينة نصر، شارع عباس العقاد، القاهرة',
    phone: '+20 100 555 8899',
    website: 'https://hope-dental.example.com',
    rating: 4.4,
    ratingCount: 201,
    verificationStatus: 'VERIFIED',
  },
  {
    providerRecordId: 'mock-medical-001',
    companyName: 'مستشفى النيل للأطفال',
    category: 'medical-center',
    governorate: 'Cairo',
    area: 'الزمالك',
    address: 'الزمالك، شارع 26 يوليو، القاهرة',
    phone: '+20 2 2736 1111',
    website: 'https://nile-children.example.com',
    rating: 4.2,
    ratingCount: 342,
    verificationStatus: 'UNVERIFIED',
  },
  {
    providerRecordId: 'mock-medical-002',
    companyName: 'مركز الإسكندرية الطبي',
    category: 'medical-center',
    governorate: 'Alexandria',
    area: 'سموحة',
    address: 'سموحة، شارع جمال عبد الناصر، الإسكندرية',
    phone: '+20 3 424 7788',
    website: 'https://alex-medical.example.com',
    rating: 4.1,
    ratingCount: 176,
    verificationStatus: 'UNVERIFIED',
  },
  {
    providerRecordId: 'mock-clinic-004',
    companyName: 'عيادة الدلتا للعيون',
    category: 'clinic',
    governorate: 'Alexandria',
    area: 'محطة الرمل',
    address: 'محطة الرمل، شارع سعد زغلول، الإسكندرية',
    phone: '+20 3 486 2233',
    website: 'https://delta-eyes.example.com',
    rating: 4.5,
    ratingCount: 95,
    verificationStatus: 'VERIFIED',
  },
  {
    providerRecordId: 'mock-restaurant-001',
    companyName: 'مطعم الذواقة للمأكولات الشرقية',
    category: 'restaurant',
    governorate: 'Cairo',
    area: 'المعادي',
    address: 'المعادي، شارع 9، القاهرة',
    phone: '+20 2 2515 7788',
    website: 'https://aldhawqah.example.com',
    rating: 3.8,
    ratingCount: 512,
    verificationStatus: 'UNVERIFIED',
  },
  {
    providerRecordId: 'mock-restaurant-002',
    companyName: 'مطعم البحر الأحمر للمأكولات البحرية',
    category: 'restaurant',
    governorate: 'Red Sea',
    area: 'الغردقة',
    address: 'الغردقة، شارع المشاية، البحر الأحمر',
    phone: '+20 65 345 6677',
    website: 'https://redsea-seafood.example.com',
    rating: 4.7,
    ratingCount: 689,
    verificationStatus: 'VERIFIED',
  },
  {
    providerRecordId: 'mock-restaurant-003',
    companyName: 'مطعم أبو قير للمأكولات البحرية',
    category: 'restaurant',
    governorate: 'Alexandria',
    area: 'سيدي بشر',
    address: 'سيدي بشر، طريق الجيش، الإسكندرية',
    phone: '+20 3 540 2233',
    website: 'https://abuqir-seafood.example.com',
    rating: 4.3,
    ratingCount: 431,
    verificationStatus: 'UNVERIFIED',
  },
];

const ARABIC_CATEGORY_KEYWORDS: ReadonlyArray<{ keyword: string; category: string }> = [
  { keyword: 'عياد', category: 'clinic' },
  { keyword: 'أسنان', category: 'dental-clinic' },
  { keyword: 'مطاعم', category: 'restaurant' },
  { keyword: 'مطعم', category: 'restaurant' },
  { keyword: 'مراكز', category: 'medical-center' },
  { keyword: 'مركز', category: 'medical-center' },
  { keyword: 'مستشفى', category: 'medical-center' },
];

/**
 * FABRICATED TEST/DEMO DATA — not a real business directory.
 *
 * Every record below is invented. This provider is only reachable when SEARCH_PROVIDER=mock is
 * set explicitly and NODE_ENV is not production (enforced in env.validation.ts and again in
 * search-provider.factory.ts). Results carry providerId "mock", which is persisted and returned
 * in API responses so mock data is always identifiable downstream.
 */
@Injectable()
export class MockSearchProvider implements SearchProviderPort {
  readonly providerId = 'mock';
  readonly capabilities: SearchCapability[] = ['search'];

  async search(query: SearchQuery): Promise<ProviderResultSet> {
    const categoryFromQuery = this.categoryFromQuery(query.query);
    const matched = SAMPLE_BUSINESSES.filter((business) => this.matches(business, query, categoryFromQuery));
    return {
      providerId: this.providerId,
      results: matched.map(toProviderResult),
      rawEvidence: matched,
    };
  }

  private categoryFromQuery(query: string): string | null {
    const normalized = query.toLowerCase();
    const match = ARABIC_CATEGORY_KEYWORDS.find((entry) => normalized.includes(entry.keyword));
    return match === undefined ? null : match.category;
  }

  private matches(business: SampleBusiness, query: SearchQuery, categoryFromQuery: string | null): boolean {
    if (
      categoryFromQuery !== null &&
      query.filters.category !== undefined &&
      !sameText(categoryFromQuery, query.filters.category)
    ) {
      return false;
    }
    const category = categoryFromQuery ?? query.filters.category;
    if (category !== undefined && !sameText(business.category, category)) {
      return false;
    }
    if (
      categoryFromQuery === null &&
      query.filters.category === undefined &&
      !this.textMatches(business, query.query)
    ) {
      return false;
    }
    if (query.filters.governorate !== undefined && !sameText(business.governorate, query.filters.governorate)) {
      return false;
    }
    if (query.filters.minRating !== undefined && business.rating < query.filters.minRating) {
      return false;
    }
    if (query.filters.verifiedOnly === true && business.verificationStatus !== 'VERIFIED') {
      return false;
    }
    return true;
  }

  private textMatches(business: SampleBusiness, rawQuery: string): boolean {
    const term = rawQuery.trim().toLowerCase();
    if (term.length === 0) {
      return true;
    }
    return (
      business.companyName.toLowerCase().includes(term) ||
      business.address.toLowerCase().includes(term) ||
      business.area.toLowerCase().includes(term)
    );
  }
}

function toProviderResult(business: SampleBusiness): ProviderSearchResult {
  return {
    providerRecordId: business.providerRecordId,
    companyName: business.companyName,
    category: business.category,
    address: `${business.governorate} — ${business.address}`,
    area: business.area,
    phone: business.phone,
    website: business.website,
    rating: business.rating,
    ratingCount: business.ratingCount,
    verificationStatus: business.verificationStatus,
    sourceUrl: `https://maps.example.com/place/${business.providerRecordId}`,
  };
}

function sameText(left: string, right: string): boolean {
  return left.localeCompare(right, undefined, { sensitivity: 'base' }) === 0;
}
