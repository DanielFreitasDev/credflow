import { Module } from '@nestjs/common';
import { ContractsModule } from '../contracts/contracts.module';
import { CollectionsModule } from '../collections/collections.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [ContractsModule, CollectionsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
