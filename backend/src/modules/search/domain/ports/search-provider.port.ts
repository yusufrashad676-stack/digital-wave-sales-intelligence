import type { ProviderResultSet } from '../entities/provider-result.js';
import type { SearchQuery } from '../entities/search-query.js';

export type SearchCapability = 'search';

export interface SearchProviderPort {
  readonly providerId: string;
  readonly capabilities: SearchCapability[];
  search(query: SearchQuery): Promise<ProviderResultSet>;
}

export const SearchProviderPort = Symbol('SearchProviderPort');
