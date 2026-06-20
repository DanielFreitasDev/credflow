import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
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
