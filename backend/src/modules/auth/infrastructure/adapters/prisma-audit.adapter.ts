import { Injectable, Logger } from '@nestjs/common';
import { RequestContextService } from '../../../../common/context/request-context.service.js';
import type { AuditEvent, AuditPort } from '../../domain/ports/audit.port.js';

@Injectable()
export class PrismaAuditAdapter implements AuditPort {
  private readonly logger = new Logger('Audit');

  constructor(private readonly requestContext: RequestContextService) {}

  record(event: AuditEvent): void {
    const requestId = event.requestId ?? this.requestContext.getRequestId();
    this.logger.log(
      JSON.stringify({
        audit: true,
        code: event.code,
        userId: event.userId ?? null,
        workspaceId: event.workspaceId ?? null,
        requestId,
        timestamp: new Date().toISOString(),
        ...event.metadata,
      }),
    );
  }
}
