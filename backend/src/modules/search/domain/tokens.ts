/**
 * Nest DI token carrying the runtime enrichment feature flag
 * (`enrichment.enabled` from validated env). Injected (optionally) into
 * application use-cases that run optional enrichment work.
 */
export const ENRICHMENT_ENABLED = Symbol('ENRICHMENT_ENABLED');
