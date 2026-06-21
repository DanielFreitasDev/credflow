import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { Request } from 'express';

/**
 * Guards GET /api/metrics with an optional bearer token. When `METRICS_TOKEN` is
 * unset the endpoint stays public (local dev / network-restricted scraping).
 * When set, a Prometheus scraper must present `Authorization: Bearer <token>`
 * (or `?token=`), compared in constant time.
 */
@Injectable()
export class MetricsAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('metricsToken');
    if (!expected) return true; // not configured -> public

    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers['authorization'];
    const bearer =
      typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : undefined;
    const provided =
      bearer ?? (typeof req.query.token === 'string' ? req.query.token : undefined);

    if (!provided || !safeEqual(provided, expected)) {
      throw new UnauthorizedException('Invalid metrics token');
    }
    return true;
  }
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
