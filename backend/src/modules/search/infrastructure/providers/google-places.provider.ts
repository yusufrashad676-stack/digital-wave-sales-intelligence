import { Injectable, Logger } from '@nestjs/common';
import { ErrorCode } from '../../../../common/exceptions/error-codes.js';
import { ServiceUnavailableException } from '../../../../common/exceptions/service-unavailable.exception.js';
import type { ProviderResultSet, ProviderSearchResult } from '../../domain/entities/provider-result.js';
import type { SearchQuery } from '../../domain/entities/search-query.js';
import type { SearchCapability, SearchProviderPort } from '../../domain/ports/search-provider.port.js';

const GOOGLE_PLACES_ENDPOINT = 'https://places.googleapis.com/v1/places:searchText';

const API_KEY_HEADER = 'X-Goog-Api-Key';
const FIELD_MASK_HEADER = 'X-Goog-FieldMask';

// Only the fields required by the current Search result contract are requested.
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.nationalPhoneNumber',
  'places.websiteUri',
  'places.rating',
  'places.userRatingCount',
  'places.googleMapsUri',
  'places.types',
].join(',');

// Internal category -> official Google place type. Categories without a clean
// mapping (e.g. home-services) intentionally omit includedType so Google returns
// the broadest safe result set and we never invent a type.
const GOOGLE_TYPE_BY_CATEGORY: Record<string, string> = {
  restaurant: 'restaurant',
  pharmacy: 'pharmacy',
  clinic: 'doctor',
  'dental-clinic': 'dentist',
  'medical-center': 'hospital',
  'car-service': 'car_repair',
  'beauty-salon': 'beauty_salon',
  gym: 'gym',
  academy: 'school',
};

const CATEGORY_BY_GOOGLE_TYPE: Record<string, string> = {
  restaurant: 'restaurant',
  pharmacy: 'pharmacy',
  doctor: 'clinic',
  dentist: 'dental-clinic',
  hospital: 'medical-center',
  car_repair: 'car-service',
  beauty_salon: 'beauty-salon',
  gym: 'gym',
  school: 'academy',
};

const GOOGLE_TYPE_PRIORITY = [
  'dentist',
  'doctor',
  'hospital',
  'restaurant',
  'pharmacy',
  'car_repair',
  'beauty_salon',
  'gym',
  'school',
];

interface GooglePlacesOptions {
  maxResults: number;
  timeoutMs: number;
}

interface GooglePlace {
  id?: string;
  displayName?: { text?: string; languageCode?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  types?: string[];
}

interface GoogleTextSearchResponse {
  places?: GooglePlace[];
  nextPageToken?: string;
}

@Injectable()
export class GooglePlacesProvider implements SearchProviderPort {
  readonly providerId = 'google-places';
  readonly capabilities: SearchCapability[] = ['search'];

  private readonly logger = new Logger(GooglePlacesProvider.name);

  constructor(
    private readonly apiKey: string,
    private readonly options: GooglePlacesOptions,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async search(query: SearchQuery): Promise<ProviderResultSet> {
    if (this.apiKey.length === 0) {
      throw new ServiceUnavailableException(ErrorCode.SERVICE_UNAVAILABLE, 'Google Places provider is not configured', {
        provider: this.providerId,
        reason: 'missing_api_key',
      });
    }

    const response = await this.request(buildRequestBody(query, this.options.maxResults));
    if (!response.ok) {
      await this.handleHttpError(response);
    }

    let payload: GoogleTextSearchResponse;
    try {
      payload = (await response.json()) as GoogleTextSearchResponse;
    } catch {
      this.logger.warn(`Google Places returned a non-JSON response`);
      throw new ServiceUnavailableException(
        ErrorCode.SERVICE_UNAVAILABLE,
        'Google Places returned an invalid response',
        { provider: this.providerId, reason: 'malformed' },
      );
    }

    if (!Array.isArray(payload.places)) {
      this.logger.warn(`Google Places response is missing the places array`);
      throw new ServiceUnavailableException(
        ErrorCode.SERVICE_UNAVAILABLE,
        'Google Places returned an invalid response',
        { provider: this.providerId, reason: 'malformed' },
      );
    }

    return {
      providerId: this.providerId,
      results: payload.places.map(toProviderResult),
      rawEvidence: payload,
      nextPageToken: payload.nextPageToken || undefined,
    };
  }

  private async request(body: Record<string, unknown>): Promise<Response> {
    try {
      return await this.fetcher(GOOGLE_PLACES_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [API_KEY_HEADER]: this.apiKey,
          [FIELD_MASK_HEADER]: FIELD_MASK,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch (error) {
      if (isTimeoutError(error)) {
        throw new ServiceUnavailableException(ErrorCode.SERVICE_UNAVAILABLE, 'Google Places request timed out', {
          provider: this.providerId,
          reason: 'timeout',
        });
      }
      this.logger.warn(`Google Places request failed at the network layer`);
      throw new ServiceUnavailableException(ErrorCode.SERVICE_UNAVAILABLE, 'Google Places is unreachable', {
        provider: this.providerId,
        reason: 'network',
      });
    }
  }

  private async handleHttpError(response: Response): Promise<never> {
    const status = response.status;
    this.logger.warn(`Google Places request failed with HTTP ${status}`);
    if (status === 429) {
      throw new ServiceUnavailableException(
        ErrorCode.SERVICE_UNAVAILABLE,
        'Google Places rate limit exceeded, please try again later',
        { provider: this.providerId, reason: 'rate_limited' },
      );
    }
    if (status >= 500) {
      throw new ServiceUnavailableException(ErrorCode.SERVICE_UNAVAILABLE, 'Google Places is temporarily unavailable', {
        provider: this.providerId,
        reason: 'upstream_error',
        httpStatus: status,
      });
    }
    throw new ServiceUnavailableException(ErrorCode.SERVICE_UNAVAILABLE, 'Google Places request was rejected', {
      provider: this.providerId,
      reason: 'client_error',
      httpStatus: status,
    });
  }
}

function buildRequestBody(query: SearchQuery, maxResults: number): Record<string, unknown> {
  const body: Record<string, unknown> = { textQuery: buildTextQuery(query) };
  const includedType = googleTypeForCategory(query.filters.category);
  if (includedType !== undefined) {
    body.includedType = includedType;
  }
  if (query.filters.minRating !== undefined) {
    body.minRating = query.filters.minRating;
  }
  body.pageSize = maxResults;
  if (query.pageToken !== undefined) {
    body.pageToken = query.pageToken;
  }
  return body;
}

function buildTextQuery(query: SearchQuery): string {
  const base = query.query.trim();
  if (query.filters.governorate !== undefined) {
    return `${base}, ${query.filters.governorate}`;
  }
  return base;
}

function googleTypeForCategory(category: string | undefined): string | undefined {
  if (category === undefined) {
    return undefined;
  }
  return GOOGLE_TYPE_BY_CATEGORY[category];
}

function toProviderResult(place: GooglePlace): ProviderSearchResult {
  return {
    providerRecordId: place.id ?? '',
    companyName: place.displayName?.text ?? '',
    category: categoryFromTypes(place.types),
    address: place.formattedAddress,
    phone: place.nationalPhoneNumber,
    website: place.websiteUri,
    rating: place.rating,
    ratingCount: place.userRatingCount,
    // verificationStatus is intentionally absent: Google data is not an
    // internal verification record, so the existing normalization yields UNKNOWN.
    sourceUrl: place.googleMapsUri,
  };
}

function categoryFromTypes(types: string[] | undefined): string | undefined {
  if (types === undefined) {
    return undefined;
  }
  const matchedType = GOOGLE_TYPE_PRIORITY.find((googleType) => types.includes(googleType));
  return matchedType === undefined ? undefined : CATEGORY_BY_GOOGLE_TYPE[matchedType];
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
}
