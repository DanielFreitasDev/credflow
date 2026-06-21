import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { MetricsService } from '../../modules/metrics/metrics.service';

interface AuthedRequest extends Request {
  user?: { id?: string };
}

/**
 * Per-request access logging + metrics. Emits one line per request — structured
 * JSON (request id, status, latency, user, ip) when LOG_FORMAT=json (default in
 * production), human-readable otherwise — and feeds the HTTP duration histogram.
 * Also stamps/propagates an `x-request-id` for correlation across services.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');
  private readonly json: boolean;

  constructor(
    private readonly config: ConfigService,
    private readonly metrics: MetricsService,
  ) {
    this.json = this.config.get<string>('logFormat') === 'json';
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const res = context.switchToHttp().getResponse<Response>();

    const requestId = (req.headers['x-request-id'] as string) || randomUUID();
    res.setHeader('x-request-id', requestId);
    const start = process.hrtime.bigint();

    const record = (statusCode: number): void => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      // Use the matched route template (e.g. /api/customers/:id), not the raw
      // URL, so metric label cardinality stays bounded.
      const route = (req.route?.path as string | undefined) ?? req.path;
      this.metrics.observeHttp(req.method, route, statusCode, durationMs / 1000);

      if (this.json) {
        this.logger.log(
          JSON.stringify({
            level: statusCode >= 500 ? 'error' : 'info',
            requestId,
            method: req.method,
            url: req.originalUrl,
            statusCode,
            durationMs: Math.round(durationMs * 100) / 100,
            userId: req.user?.id,
            ip: req.ip,
          }),
        );
      } else {
        this.logger.log(
          `${req.method} ${req.originalUrl} ${statusCode} ${durationMs.toFixed(1)}ms`,
        );
      }
    };

    return next.handle().pipe(
      tap({
        next: () => record(res.statusCode),
        error: (err: { status?: number }) =>
          record(typeof err?.status === 'number' ? err.status : 500),
      }),
    );
  }
}
