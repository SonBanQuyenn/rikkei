import cluster from 'node:cluster';
import { Coordinator } from '../limiter/coordinator.js';
import { DistributedLimiter } from '../limiter/distributed-limiter.js';
import { maxInAnyWindow } from '../limiter/window-stats.js';
import { IpcTransport, serveCoordinator } from './ipc.js';

/**
 * Mo phong 6 tien trinh gateway sau bo can bang tai (chia KHONG deu) gui giao dich sang ngan hang.
 * Dong thoi gian: 3s binh thuong (2.000 req/s) -> BURST_SECONDS dot bien x2,5 (5.000 req/s) -> 2s binh thuong.
 */
const LIMIT = 3000;
const WINDOW_MS = 1000;
/** Chua 2% bien do cho do tre IPC/mang + sai so bo hen gio giua luc quyet dinh va luc gui that */
const RATE = 2940;
const MAX_DELAY_MS = 100;
const PROCESSES = 6;
const SHARES = [0.25, 0.2, 0.15, 0.15, 0.15, 0.1];
const BURST_SECONDS = Number(process.env.BURST_SECONDS ?? 30);
const PHASES = [
  { name: 'binh thuong', seconds: 3, rate: 2000 },
  { name: 'dot bien x2.5', seconds: BURST_SECONDS, rate: 5000 },
  { name: 'binh thuong', seconds: 2, rate: 2000 },
];
const KEY = 'bank:partner-A';
const clock = () => performance.timeOrigin + performance.now();

type WorkerReport = { type: 'report'; offered: number[]; allowed: number[]; sentAt: number[]; maxDelay: number };

if (cluster.isPrimary) {
  const coordinator = new Coordinator({ rate: RATE, maxDelayMs: MAX_DELAY_MS });
  const scheduled: number[] = [];
  const reports: WorkerReport[] = [];
  const startAt = clock() + 500;

  for (let i = 0; i < PROCESSES; i++) {
    const worker = cluster.fork({ SHARE: String(SHARES[i]), START_AT: String(startAt) });
    serveCoordinator(worker, coordinator, clock, (_key, at, d) => d.allowed && scheduled.push(at + d.delayMs));
    worker.on('message', (msg: WorkerReport) => {
      if (msg?.type !== 'report') return;
      reports.push(msg);
      worker.kill();
      if (reports.length === PROCESSES) summarize();
    });
  }

  function summarize() {
    const seconds = PHASES.reduce((s, p) => s + p.seconds, 0);
    console.log(`\n${PROCESSES} tien trinh, ty le chia tai ${SHARES.join(' / ')}, nguong ${LIMIT} req/s`);
    console.log(`Gao ro: r = ${RATE} giao dich/giay, tre toi da ${MAX_DELAY_MS}ms\n`);
    console.log('giay | giai doan        | gui    | cho qua | bi chan');
    let t = 0;
    for (const phase of PHASES) {
      for (let s = 0; s < phase.seconds; s++, t++) {
        const offered = reports.reduce((n, r) => n + r.offered[t], 0);
        const allowed = reports.reduce((n, r) => n + r.allowed[t], 0);
        console.log(
          `${String(t + 1).padStart(4)} | ${phase.name.padEnd(16)} | ${String(offered).padStart(6)} | ${String(allowed).padStart(7)} | ${String(offered - allowed).padStart(7)}`,
        );
      }
    }
    const offered = reports.reduce((n, r) => n + r.offered.reduce((a, b) => a + b, 0), 0);
    const sentAt = reports.flatMap((r) => r.sentAt).sort((a, b) => a - b);
    const maxScheduled = maxInAnyWindow(scheduled.sort((a, b) => a - b), WINDOW_MS);
    const max = maxInAnyWindow(sentAt, WINDOW_MS);
    const maxDelay = Math.max(...reports.map((r) => r.maxDelay));
    const mem = process.memoryUsage();
    console.log(`\nTong ${seconds}s: gui ${offered}, cho qua ${sentAt.length}, bi chan ${offered - sentAt.length}`);
    console.log(`Lon nhat trong 1 giay truot bat ky - theo lich bo dieu phoi : ${maxScheduled}`);
    console.log(`Lon nhat trong 1 giay truot bat ky - thoi diem gui THAT     : ${max} (nguong ${LIMIT}) -> ${max <= LIMIT ? 'DAT' : 'VUOT NGUONG'}`);
    console.log(`Do tre them toi da cua mot giao dich: ${maxDelay.toFixed(0)}ms`);
    console.log(`Bo nho tien trinh dieu phoi: heap ${(mem.heapUsed / 1048576).toFixed(1)}MB, rss ${(mem.rss / 1048576).toFixed(1)}MB (gioi han 256MB)`);
    console.log(`Suc chua toi da trong ngan sach 128MB: ${coordinator.maxKeys} khoa`);
    process.exit(max <= LIMIT ? 0 : 1);
  }
} else {
  const share = Number(process.env.SHARE);
  const startAt = Number(process.env.START_AT);
  const limiter = new DistributedLimiter(new IpcTransport(), 200);
  const total = PHASES.reduce((s, p) => s + p.seconds, 0);
  const offered = new Array<number>(total).fill(0);
  const allowed = new Array<number>(total).fill(0);
  const sentAt: number[] = [];
  const inflight: Promise<void>[] = [];
  let maxDelay = 0;
  let carry = 0;
  let lastElapsed = 0;

  const rateAt = (sec: number) => {
    let t = 0;
    for (const p of PHASES) if (sec < (t += p.seconds)) return p.rate;
    return 0;
  };

  const tick = () => {
    const elapsed = clock() - startAt;
    const sec = Math.floor(elapsed / 1000);
    if (sec >= total) {
      clearInterval(timer);
      Promise.all(inflight).then(() => process.send!({ type: 'report', offered, allowed, sentAt, maxDelay } satisfies WorkerReport));
      return;
    }
    if (elapsed < 0) return;
    // Tinh theo thoi gian troi qua thuc te (setInterval tren Windows gian cach ~15ms chu khong phai 10ms)
    carry += (rateAt(sec) * share * (elapsed - lastElapsed)) / 1000;
    lastElapsed = elapsed;
    const n = Math.floor(carry);
    carry -= n;
    for (let i = 0; i < n; i++) {
      offered[sec]++;
      const arrivedAt = clock();
      inflight.push(
        // "Goi sang ngan hang" (mo phong): ghi lai thoi diem gui that
        limiter.send(KEY, () => sentAt.push(clock())).then((r) => {
          if (!r.sent) return;
          allowed[sec]++;
          maxDelay = Math.max(maxDelay, clock() - arrivedAt);
        }),
      );
    }
  };
  const timer = setInterval(tick, 10);
}
