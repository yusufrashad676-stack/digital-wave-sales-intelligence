export type CriteriaValue = 'ABSENT' | 'PRESENT' | 'ANY';

export interface SearchIntentLocation {
  area?: string;
  governorate?: string;
}

export interface SearchIntentDiscovery {
  category: string;
  location: SearchIntentLocation;
  minRating?: number;
}

export interface SearchIntentCriteria {
  website: CriteriaValue;
  social: CriteriaValue;
  minRating?: number;
}

export interface SearchIntentOpportunity {
  maxQuantity: number;
}

export interface SearchIntent {
  rawQuery: string;
  discovery: SearchIntentDiscovery;
  criteria: SearchIntentCriteria;
  opportunity: SearchIntentOpportunity;
}
