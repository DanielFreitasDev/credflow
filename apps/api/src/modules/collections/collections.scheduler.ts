import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CollectionsService } from './collections.service';

/**
 * Drives the collections cycle automatically. Without this, overdue detection,
 * the dunning ladder and promise reconciliation would only run when an operator
 * manually hit POST /collections/run. The job is idempotent, so a missed or
 * duplicated run is harmless.
 */
@Injectable()
export class CollectionsScheduler {
  private readonly logger = new Logger(CollectionsScheduler.name);
  // In-process re-entrancy guard: prevents a slow run from overlapping the next
  // tick (or a manual POST /collections/run) on the same instance. For multiple
  // replicas, add a leader election / Postgres advisory lock at the infra layer.
  private running = false;

  constructor(private readonly collections: CollectionsService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, {
    name: 'daily-collections',
    timeZone: 'America/Sao_Paulo',
  })
  async handleDaily(): Promise<void> {
    if (this.running) {
      this.logger.warn('Daily collections run skipped: a previous run is still in progress.');
      return;
    }
    this.running = true;
    try {
      const result = await this.collections.runDailyCollections();
      this.logger.log(`Daily collections run: ${JSON.stringify(result)}`);
    } catch (err) {
      const e = err as Error;
      this.logger.error(`Daily collections run failed: ${e.message}`, e.stack);
    } finally {
      this.running = false;
    }
  }
}
