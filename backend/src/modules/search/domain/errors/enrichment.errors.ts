/**
 * Domain-level enrichment errors.
 *
 * These classes live in the domain layer and must NOT import any
 * framework-specific code (@nestjs/*, @prisma/client). Infrastructure
 * adapters translate these into application-level exceptions at the
 * appropriate boundary.
 */

export class EnrichmentProviderError extends Error {
  public readonly provider: string;

  constructor(provider: string, message: string, cause?: Error) {
    super(message);
    this.name = 'EnrichmentProviderError';
    this.provider = provider;
    if (cause) {
      this.cause = cause;
    }
  }
}

export class EnrichmentTimeoutError extends EnrichmentProviderError {
  constructor(provider: string, message = 'Enrichment provider timed out') {
    super(message, provider);
    this.name = 'EnrichmentTimeoutError';
  }
}

export class EnrichmentNetworkError extends EnrichmentProviderError {
  constructor(provider: string, message = 'Enrichment provider is unreachable') {
    super(message, provider);
    this.name = 'EnrichmentNetworkError';
  }
}

export class UrlSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UrlSafetyError';
  }
}

export class RobotsTxtBlockedError extends Error {
  constructor(
    public readonly url: string,
    message = 'URL blocked by robots.txt',
  ) {
    super(message);
    this.name = 'RobotsTxtBlockedError';
  }
}

export class EnrichmentLockError extends Error {
  constructor(executionId: string) {
    super(`Execution ${executionId} is already being enriched`);
    this.name = 'EnrichmentLockError';
  }
}
