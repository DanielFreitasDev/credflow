import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

// PrismaService is provided globally (PrismaModule is @Global), so the
// controller can inject it without importing PrismaModule here.
@Module({ controllers: [HealthController] })
export class HealthModule {}
