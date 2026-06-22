import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditEntry {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
  ip?: string | null;
}

/**
 * Append-only audit trail. Failures here must never break the business flow,
 * so writes are best-effort and errors are logged, not thrown.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Writes an audit row. Pass `client` (a `$transaction` client) when recording
   * from inside a business transaction so the audit entry commits — or rolls
   * back — together with the change it describes, instead of via a separate
   * connection that could persist a log for a transaction that never committed.
   * Still best-effort: a write failure is logged, never thrown.
   */
  async record(entry: AuditEntry, client?: Prisma.TransactionClient): Promise<void> {
    try {
      await (client ?? this.prisma).auditLog.create({
        data: {
          userId: entry.userId ?? null,
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId ?? null,
          before: entry.before ?? Prisma.DbNull,
          after: entry.after ?? Prisma.DbNull,
          ip: entry.ip ?? null,
        },
      });
    } catch (err) {
      this.logger.error(`Failed to write audit log for ${entry.entity}:${entry.action}`, err as Error);
    }
  }
}
