import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { MetricsService } from './metrics.service';
import { MetricsAuthGuard } from './metrics-auth.guard';

@Controller('metrics')
@UseGuards(MetricsAuthGuard)
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  // @Public() skips the global JWT guard so a scraper needn't hold a user token;
  // MetricsAuthGuard then enforces METRICS_TOKEN when configured (else public).
  @Public()
  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @ApiExcludeEndpoint()
  scrape(): Promise<string> {
    return this.metrics.metrics();
  }
}
