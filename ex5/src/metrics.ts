import { NextFunction, Request, Response } from 'express';

// So lieu toi thieu de verify.sh quyet dinh co quay lui hay khong:
// tong request, so request 5xx, do tre p95 trong 500 request gan nhat.
export class Metrics {
  private total = 0;
  private errors5xx = 0;
  private latencies: number[] = [];

  constructor(private readonly window = 500) {}

  record(status: number, durationMs: number): void {
    this.total++;
    if (status >= 500) this.errors5xx++;
    this.latencies.push(durationMs);
    if (this.latencies.length > this.window) this.latencies.shift();
  }

  p95(): number {
    if (this.latencies.length === 0) return 0;
    const sorted = [...this.latencies].sort((a, b) => a - b);
    return sorted[Math.ceil(sorted.length * 0.95) - 1];
  }

  snapshot() {
    return {
      requestsTotal: this.total,
      errors5xxTotal: this.errors5xx,
      latencyP95Ms: Math.round(this.p95()),
    };
  }

  middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const start = process.hrtime.bigint();
      res.on('finish', () => {
        if (req.path === '/metrics') return;
        this.record(res.statusCode, Number(process.hrtime.bigint() - start) / 1e6);
      });
      next();
    };
  }
}
