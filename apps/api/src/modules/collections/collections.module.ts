import { Module } from '@nestjs/common';
import { CollectionsController } from './collections.controller';
import { CollectionsService } from './collections.service';
import { CollectionsScheduler } from './collections.scheduler';

@Module({
  controllers: [CollectionsController],
  providers: [CollectionsService, CollectionsScheduler],
  exports: [CollectionsService],
})
export class CollectionsModule {}
