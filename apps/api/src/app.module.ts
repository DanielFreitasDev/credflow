import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { ScheduleModule } from '@nestjs/schedule';
import Redis from 'ioredis';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './common/audit/audit.module';
import { CryptoModule } from './common/crypto/crypto.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from './modules/auth/guards/roles.guard';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CustomersModule } from './modules/customers/customers.module';
import { ProposalsModule } from './modules/proposals/proposals.module';
import { AnalysisModule } from './modules/analysis/analysis.module';
import { ContractsModule } from './modules/contracts/contracts.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { CollectionsModule } from './modules/collections/collections.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AuditReadModule } from './modules/audit/audit-read.module';
import { ReportsModule } from './modules/reports/reports.module';
import { HealthModule } from './modules/health/health.module';
import { MetricsModule } from './modules/metrics/metrics.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get<string>('throttle.redisUrl');
        return {
          throttlers: [
            {
              ttl: config.get<number>('throttle.ttl', 60) * 1000,
              limit: config.get<number>('throttle.limit', 120),
            },
          ],
          // A shared Redis store keeps rate limits consistent across replicas
          // and restarts; without it we fall back to per-process in-memory
          // counters (fine for a single instance / local dev).
          storage: redisUrl
            ? new ThrottlerStorageRedisService(new Redis(redisUrl))
            : undefined,
        };
      },
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuditModule,
    CryptoModule,
    AuthModule,
    UsersModule,
    CustomersModule,
    ProposalsModule,
    AnalysisModule,
    ContractsModule,
    PaymentsModule,
    CollectionsModule,
    DashboardModule,
    AuditReadModule,
    ReportsModule,
    HealthModule,
    MetricsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
