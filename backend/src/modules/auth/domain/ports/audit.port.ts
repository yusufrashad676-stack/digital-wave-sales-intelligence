export const AuditPort = Symbol('AuditPort');

export interface AuditEvent {
  code: string;
  userId?: string;
  workspaceId?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditPort {
  record(event: AuditEvent): void;
}
