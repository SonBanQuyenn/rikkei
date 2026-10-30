import { readFileSync } from 'node:fs';
import { Controller, Get, Inject, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { DASHBOARD_CONFIG, type DashboardConfig } from './config.js';
import { MetricsService, type DashboardEvent } from './metrics.service.js';

const INDEX_HTML = readFileSync(new URL('../../public/index.html', import.meta.url), 'utf8');

@Controller()
export class DashboardController {
  constructor(
    private readonly metrics: MetricsService,
    @Inject(DASHBOARD_CONFIG) private readonly config: DashboardConfig,
  ) {}

  @Get()
  index(@Res() res: Response) {
    res.type('html').send(INDEX_HTML);
  }

  /** Luong su kien mot chieu (Server-Sent Events). */
  @Get('dashboard/stream')
  stream(@Req() req: Request, @Res() res: Response) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // khong de proxy gom/buffer su kien
    });
    res.write(`retry: ${this.config.retryMs}\n\n`);

    const send = (e: DashboardEvent) =>
      res.write(`id: ${this.metrics.wireId(e.id)}\nevent: ${e.type}\ndata: ${JSON.stringify(e.data)}\n\n`);

    // Trinh duyet tu gui header Last-Event-ID khi noi lai -> phat bu nhung gi da lo.
    // Khi trang tu tao EventSource moi (watchdog) thi id di qua query ?lastEventId=.
    const query = req.query.lastEventId;
    const lastId = req.header('last-event-id') ?? (typeof query === 'string' ? query : undefined);
    const missed = lastId !== undefined ? this.metrics.since(lastId) : null;
    if (missed) missed.forEach(send);
    else {
      const snapshot = this.metrics.snapshot();
      res.write(`id: ${this.metrics.lastEventId}\nevent: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);
    }

    const unsubscribe = this.metrics.subscribe(send);
    // Ban dem hang gio khong co du lieu: van gui heartbeat de LB (60s) khong cat ket noi
    // va de client phat hien ket noi chet "im lang".
    const heartbeat = setInterval(() => res.write(`event: heartbeat\ndata: ${Date.now()}\n\n`), this.config.heartbeatMs);

    // Don dep khi man hinh ngat ket noi: khong ro ri listener/timer.
    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  }
}
