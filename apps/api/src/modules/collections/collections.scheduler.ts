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

  constructor(private readonly collections: CollectionsService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, {
    name: 'daily-collections',
    timeZone: 'America/Sao_Paulo',
  })
  async handleDaily(): Promise<void> {
    try {
      const result = await this.collections.runDailyCollections();
      this.logger.log(`Daily collections run: ${JSON.stringify(result)}`);
    } catch (err) {
      const e = err as Error;
      this.logger.error(`Daily collections run failed: ${e.message}`, e.stack);
    }
  }
}
