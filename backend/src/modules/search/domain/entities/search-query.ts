import type { SearchIntent } from './search-intent.js';

export interface SearchFilters {
  governorate?: string;
  category?: string;
  minRating?: number;
  verifiedOnly?: boolean;
  intent?: SearchIntent;
}

export class SearchQuery {
  constructor(
    public readonly query: string,
    public readonly filters: SearchFilters = {},
    public readonly pageToken?: string,
    public readonly targetQuantity?: number,
  ) {}
}
