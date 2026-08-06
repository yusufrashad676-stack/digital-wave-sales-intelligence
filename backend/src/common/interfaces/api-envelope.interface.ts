export interface ApiEnvelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}
