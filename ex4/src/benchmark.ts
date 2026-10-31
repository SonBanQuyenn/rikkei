/**
 * Chay thu thu nho cua chien dich voi 4 tien trinh worker that, nha cung cap gia lap gioi han 100/s
 * (vuot nguong bi chan 10 phut), 3% email sai dinh dang, mot it dia chi khong ton tai va dong trung,
 * dong thoi co luong email giao dich 10/s chay nen. Giua chung tam dung chien dich 3 giay.
 *   npm run bench          (BENCH_N=4000 mac dinh)
 */
import { fork, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { redisConnection } from './config/redis.config.js';
import {
  CAMPAIGN_QUEUE,
  CAMPAIGN_SIZE,
  MAX_PROCESSES,
  REQUIRED_RATE_PER_SEC,
  TRANSACTIONAL_QUEUE,
} from './config/email.config.js';
import { FakeProviderServer } from './provider/fake-provider-server.js';
import { CampaignStats } from './campaign/campaign.stats.js';
import { loadCampaign, type CampaignJob, type Recipient } from './campaign/campaign.loader.js';
import { CampaignControl } from './campaign/campaign.control.js';
import { LATENCY_KEY, transactionalJobOptions, type TransactionalJob } from './transactional/transactional.worker.js';

const N = Number(process.env.BENCH_N ?? 4000);
const prefix = `bench-${randomUUID().slice(0, 6)}`;
const campaignId = `km-${prefix}`;
const t0 = Date.now();
const log = (msg: string) => console.log(`${`+${((Date.now() - t0) / 1000).toFixed(1)}s`.padStart(7)}  ${msg}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Danh sach khach: ~3% sai dinh dang, ~0,5% khong ton tai, ~0,5% dong trung (cung email, khac ma khach). */
function* recipients(): Generator<Recipient> {
  for (let i = 1; i <= N; i++) {
    const id = `KH${String(i).padStart(6, '0')}`;
    let email = `khach${i}@shopfast.vn`;
    if (i % 33 === 0) email = [`khach${i}@@shopfast.vn`, `khach${i} @shopfast.vn`, `khach${i}.shopfast.vn`, `khach${i}@shopfast`][i % 4];
    else if (i % 200 === 7) email = `ghost${i}@shopfast.vn`;
    else if (i % 200 === 13) email = `KHACH${i - 1}@ShopFast.vn`; // trung voi khach ngay truoc
    yield { customerId: id, email, name: `Khach ${i}` };
  }
}

async function main() {
  const redis = new Redis(redisConnection);
  const limiterKey = `${prefix}:provider-calls`;
  await redis.del(LATENCY_KEY);
  const provider = new FakeProviderServer();
  const providerUrl = await provider.start();

  const campaignQueue = new Queue<CampaignJob>(CAMPAIGN_QUEUE, { connection: redisConnection, prefix });
  const txQueue = new Queue<TransactionalJob>(TRANSACTIONAL_QUEUE, { connection: redisConnection, prefix });
  const stats = new CampaignStats(redis, campaignId);
  const control = new CampaignControl(campaignQueue, stats);

  log(`Nap ${N} khach vao hang doi chien dich (lo 1.000 job)...`);
  const loaded = await loadCampaign(campaignQueue, stats, recipients());
  log(`Da nap: ${JSON.stringify(loaded)}`);

  const workers: ChildProcess[] = [];
  const main = fileURLToPath(new URL('./main.js', import.meta.url));
  for (let i = 0; i < MAX_PROCESSES; i++) {
    workers.push(
      fork(main, [], {
        env: { ...process.env, PROVIDER_URL: providerUrl, BULL_PREFIX: prefix, LIMITER_KEY: limiterKey },
        stdio: 'ignore',
      }),
    );
  }
  log(`Khoi dong ${MAX_PROCESSES} tien trinh worker`);

  // Luong email giao dich chay nen ~10/s trong suot chien dich.
  let txSent = 0;
  const txTimer = setInterval(() => {
    const key = `order-confirm-${prefix}-${++txSent}`;
    void txQueue.add('confirm', { to: `don${txSent}@shopfast.vn`, subject: 'Xac nhan don', html: '...', idempotencyKey: key }, transactionalJobOptions(key));
  }, 100);

  let paused = false;
  for (;;) {
    await sleep(2000);
    const p = await stats.progress();
    log(
      `[${p.state.padEnd(9)}] ${String(p.percent).padStart(5)}%  sent=${p.sent} invalid=${p.invalidRecipient} failed=${p.failed} ` +
        `| ${p.ratePerSec}/s ETA ${p.etaSec ?? '-'}s | nha cung cap dinh ${provider.stats.peakPerSecond}/s, bi chan ${provider.stats.blockedCalls}`,
    );
    if (!paused && p.percent >= 40) {
      paused = true;
      await control.pause();
      const before = (await stats.progress()).sent;
      log(`>>> TAM DUNG chien dich (phat hien sai sot) - sent=${before}`);
      await sleep(3000);
      const during = (await stats.progress()).sent;
      log(`>>> Sau 3s tam dung: sent=${during} (chi tang ${during - before} = job dang goi do luc dung)`);
      await control.resume();
      log('>>> TIEP TUC chien dich');
    }
    if (p.remaining === 0) break;
  }
  clearInterval(txTimer);
  await sleep(1500);

  const p = await stats.progress();
  const campaignDeliveries = provider.stats.delivered.filter((d) => d.kind === 'campaign');
  const campaignAddrs = campaignDeliveries.map((d) => d.to);
  const duplicates = campaignAddrs.length - new Set(campaignAddrs).size;
  const first = campaignDeliveries[0].at;
  const last = campaignDeliveries.at(-1)!.at;
  const activeSec = (last - first) / 1000 - 3; // tru 3 giay tam dung
  const rate = campaignDeliveries.length / activeSec;
  const lat = (await redis.lrange(LATENCY_KEY, 0, -1)).map(Number).sort((a, b) => a - b);
  const pct = (q: number) => lat[Math.min(lat.length - 1, Math.floor(q * lat.length))];

  console.log('\n================ KET QUA ================');
  console.log(`Danh sach: ${p.total} | nap vao hang doi: ${p.queued} | sai dinh dang: ${p.invalidFormat} | trung: ${p.duplicates}`);
  console.log(`Gui thanh cong: ${p.sent} | khong ton tai (khong thu lai): ${p.invalidRecipient} | loi het lan thu: ${p.failed}`);
  console.log(`So email chien dich nha cung cap thuc su gui: ${campaignDeliveries.length}, trong do trung dia chi: ${duplicates}`);
  console.log(`Nha cung cap: ${provider.stats.calls} lan goi, dinh ${provider.stats.peakPerSecond} lan/giay (gioi han 100), bi chan: ${provider.stats.blockedCalls}`);
  console.log(`Thong luong chien dich dat duoc: ${rate.toFixed(1)} email/s (yeu cau toi thieu ${REQUIRED_RATE_PER_SEC.toFixed(1)}/s)`);
  console.log(`Email giao dich: ${lat.length} | do tre p50=${pct(0.5)}ms p95=${pct(0.95)}ms max=${lat.at(-1)}ms`);
  console.log(`Ngoai suy 500.000 khach (~${Math.round(CAMPAIGN_SIZE * 0.97)} hop le): ${(CAMPAIGN_SIZE * 0.97 / rate / 60).toFixed(0)} phut (han 120 phut)`);

  for (const w of workers) w.send('shutdown');
  await Promise.all(workers.map((w) => new Promise((r) => w.on('exit', r))));
  await campaignQueue.obliterate({ force: true });
  await txQueue.obliterate({ force: true });
  await Promise.all([campaignQueue.close(), txQueue.close(), stats.clear(), redis.del(limiterKey, LATENCY_KEY)]);
  await redis.quit();
  await provider.stop();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
