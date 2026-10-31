import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { PROVIDER_BLOCK_MS, PROVIDER_LIMIT_PER_SEC } from '../config/email.config.js';
import type { SendRequest } from './email-provider.js';

export type ProviderStats = {
  calls: number;
  delivered: { to: string; kind: SendRequest['kind']; at: number }[];
  rejectedInvalid: number;
  blockedCalls: number;
  /** So lan goi lon nhat trong bat ky cua so truot 1 giay nao (do tai nha cung cap). */
  peakPerSecond: number;
};

/**
 * Nha cung cap email gia lap chay nhu mot dich vu HTTP rieng (moi tien trinh worker goi vao cung mot cho):
 *  - dem moi lan goi (tinh phi), vuot 100 lan/giay -> chan 10 phut (429);
 *  - dia chi bat dau bang "ghost" -> 550 khong ton tai;
 *  - cung idempotency-key -> tra lai ket qua cu, khong gui them;
 *  - do tre ngau nhien 30-120 ms; co the cai them loi tam thoi.
 */
export class FakeProviderServer {
  readonly stats: ProviderStats = { calls: 0, delivered: [], rejectedInvalid: 0, blockedCalls: 0, peakPerSecond: 0 };
  private readonly window: number[] = [];
  private blockedUntil = 0;
  private readonly byKey = new Map<string, string>();
  private server?: Server;
  /** Ti le loi 503 tam thoi (0..1). */
  transientErrorRate = 0;

  async start(port = 0) {
    this.server = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => void this.handle(JSON.parse(body) as SendRequest, res));
    });
    await new Promise<void>((r) => this.server!.listen(port, '127.0.0.1', r));
    return `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  stop() {
    return new Promise<void>((r) => this.server?.close(() => r()) ?? r());
  }

  private async handle(req: SendRequest, res: import('node:http').ServerResponse) {
    const now = Date.now();
    this.stats.calls++;
    while (this.window.length && this.window[0] <= now - 1000) this.window.shift();
    this.window.push(now);
    this.stats.peakPerSecond = Math.max(this.stats.peakPerSecond, this.window.length);
    if (this.window.length > PROVIDER_LIMIT_PER_SEC) this.blockedUntil = now + PROVIDER_BLOCK_MS;
    if (now < this.blockedUntil) {
      this.stats.blockedCalls++;
      res.writeHead(429, { 'retry-after-ms': String(this.blockedUntil - now) }).end();
      return;
    }

    await new Promise((r) => setTimeout(r, 30 + Math.random() * 90));
    if (Math.random() < this.transientErrorRate) return void res.writeHead(503).end();
    if (req.to.startsWith('ghost')) {
      this.stats.rejectedInvalid++;
      return void res.writeHead(550).end();
    }
    let messageId = this.byKey.get(req.idempotencyKey);
    if (!messageId) {
      messageId = `m-${this.byKey.size + 1}`;
      this.byKey.set(req.idempotencyKey, messageId);
      this.stats.delivered.push({ to: req.to, kind: req.kind, at: Date.now() });
    }
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ messageId }));
  }
}
