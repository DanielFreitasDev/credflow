import { Injectable } from '@nestjs/common';
import { Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * Prometheus metrics on a dedicated registry (not the global default), so the
 * app owns exactly what it exposes. Default Node/process metrics + an HTTP
 * request-duration histogram fed by the LoggingInterceptor.
 */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();
  private readonly httpDuration: Histogram<string>;

  constructor() {
    this.registry.setDefaultLabels({ app: 'credflow-api' });
    collectDefaultMetrics({ register: this.registry });
    this.httpDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [this.registry],
    });
  }

  observeHttp(method: string, route: string, statusCode: number, durationSeconds: number): void {
    this.httpDuration.observe(
      { method, route, status_code: String(statusCode) },
      durationSeconds,
    );
  }

  metrics(): Promise<string> {
    return this.registry.metrics();
  }
}
