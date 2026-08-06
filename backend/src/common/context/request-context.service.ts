import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContextData {
  requestId: string;
  startedAt: number;
}

export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContextData>();

  run<T>(data: RequestContextData, callback: () => T): T {
    return this.storage.run(data, callback);
  }

  get(): RequestContextData | undefined {
    return this.storage.getStore();
  }

  getRequestId(): string {
    return this.storage.getStore()?.requestId ?? 'unknown';
  }
}
