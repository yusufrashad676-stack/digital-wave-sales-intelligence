import type { AppConfig, NodeEnv } from '../../../../config/configuration.js';
import type { SearchProviderPort } from '../../domain/ports/search-provider.port.js';
import { GooglePlacesProvider } from './google-places.provider.js';
import { MockSearchProvider } from './mock-search.provider.js';

export function createSearchProvider(search: AppConfig['search'], nodeEnv: NodeEnv): SearchProviderPort {
  if (search.provider === 'google-places') {
    const apiKey = search.googleMapsApiKey;
    if (!apiKey) {
      throw new Error('GOOGLE_MAPS_API_KEY is required when SEARCH_PROVIDER is "google-places"');
    }
    return new GooglePlacesProvider(apiKey, {
      maxResults: search.maxResults,
      timeoutMs: search.googleTimeoutMs,
    });
  }

  if (search.provider === 'mock') {
    if (nodeEnv === 'production') {
      throw new Error('SEARCH_PROVIDER=mock is not allowed in production');
    }
    return new MockSearchProvider();
  }

  throw new Error(`Unsupported SEARCH_PROVIDER "${String(search.provider)}" — mock is never selected implicitly`);
}
