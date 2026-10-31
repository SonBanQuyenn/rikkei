/**
 * Do so truy van CSDL tai thoi diem khoa het han.
 * 4 instance ung dung (moi instance mot ket noi Redis rieng, dung chung du lieu) nhan 200 request cung luc
 * cho cung mot san pham flash sale ngay khi ban ghi dem vua het han.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import RedisMock from 'ioredis-mock';
import type { Redis } from 'ioredis';
import { ProductRepository } from './product.repository.js';
import { OriginalProductService } from './product.service.original.js';
import { ProductService, productKey } from './product.service.js';

const INSTANCES = 4;
const REQUESTS = 200;
const ROUNDS = 5;
const DB_LATENCY_MS = 300;
const PRODUCT_ID = 'FS-001';

type Getter = { getProductWithLock(id: string): Promise<unknown> };
type Factory = (redis: Redis, repo: ProductRepository) => Getter;

// Moi instance ung dung mot ket noi Redis rieng, dung chung du lieu
const connections = Array.from({ length: INSTANCES }, () => new RedisMock() as unknown as Redis);
const admin = new RedisMock();

async function runRound(factory: Factory) {
  const repo = new ProductRepository(DB_LATENCY_MS);
  const instances = connections.map((redis) => factory(redis, repo));
  await admin.del(productKey(PRODUCT_ID)); // khoa vua het han

  const started = performance.now();
  const results = await Promise.allSettled(
    Array.from({ length: REQUESTS }, (_, i) => instances[i % INSTANCES].getProductWithLock(PRODUCT_ID)),
  );
  const elapsed = performance.now() - started;
  return {
    queries: repo.queries,
    ok: results.filter((r) => r.status === 'fulfilled').length,
    elapsedMs: Math.round(elapsed),
  };
}

async function measure(label: string, factory: Factory) {
  const lines = [`## ${label}`];
  const counts: number[] = [];
  for (let round = 1; round <= ROUNDS; round++) {
    const r = await runRound(factory);
    counts.push(r.queries);
    lines.push(`lan ${round}: ${r.queries} truy van DB | ${r.ok}/${REQUESTS} request thanh cong | ${r.elapsedMs} ms`);
  }
  lines.push(`=> trung binh ${(counts.reduce((a, b) => a + b, 0) / ROUNDS).toFixed(1)} truy van DB / lan het han`);
  return lines;
}

const output = [
  `# Do tai: ${REQUESTS} request dong thoi, ${INSTANCES} instance, DB tre ${DB_LATENCY_MS} ms, ${new Date().toISOString()}`,
  '',
  ...(await measure('TRUOC - ham goc chua co khoa', (redis, repo) => new OriginalProductService(redis, repo))),
  '',
  ...(await measure('SAU - khoa phan tan + do lech TTL', (redis, repo) => new ProductService(redis, repo))),
];

console.log(output.join('\n'));
mkdirSync('logs', { recursive: true });
writeFileSync('logs/benchmark.log', output.join('\n') + '\n');
process.exit(0);
