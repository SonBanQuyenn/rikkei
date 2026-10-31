import { maxInAnyWindow } from '../limiter/window-stats.js';
import { type Algorithm, FixedWindow, LeakyBucket, SlidingLogAlgorithm, SlidingWindowCounter, TokenBucket } from './algorithms.js';

/**
 * So sanh dinh luong 5 thuat toan cho bai toan cong thanh toan:
 * - vuot nguong 3.000 / 1 giay truot bat ky? (rang buoc tuyet doi)
 * - so lan chan oan = so bi chan nhieu hon muc toi thieu bat buoc
 *   (muc toi thieu = so bi chan cua nhat ky cua so truot, vi chap nhan tham lam la toi uu cho rang buoc nay)
 * - bo nho cho 100.000 khoa
 */
const LIMIT = 3000;

const candidates: Record<string, () => Algorithm> = {
  '(a) Cua so co dinh 3000/giay': () => new FixedWindow(LIMIT),
  '(b) Nhat ky cua so truot': () => new SlidingLogAlgorithm(LIMIT),
  '(c) Bo dem cua so truot': () => new SlidingWindowCounter(LIMIT),
  '(d) Gao token r=2700 C=300': () => new TokenBucket(2700, 300),
  '(e) Gao ro r=2990 tre <=100ms': () => new LeakyBucket(2990, 100),
  "(e') Gao ro r=2940 tre <=100ms": () => new LeakyBucket(2940, 100),
};

/** PRNG co dinh hat giong de ket qua lap lai duoc. */
function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/** Sinh thoi diem den, phan bo ngau nhien deu trong tung giay theo `rateAt(giay)`. */
function arrivals(seconds: number, rateAt: (sec: number) => number, seed = 42) {
  const rand = rng(seed);
  const times: number[] = [];
  for (let s = 0; s < seconds; s++) {
    const n = rateAt(s);
    const batch = Array.from({ length: n }, () => s * 1000 + rand() * 1000).sort((x, y) => x - y);
    times.push(...batch);
  }
  return times;
}

/** Xung dot bien rai deu tu `from` den `to` (ms) voi toc do `rate`/giay. */
function pulse(from: number, to: number, rate: number) {
  const n = Math.round(((to - from) * rate) / 1000);
  return Array.from({ length: n }, (_, i) => from + (i * (to - from)) / n);
}

const scenarios: Record<string, number[]> = {
  // 60s binh thuong 2.000 req/s, 30s dot bien x2,5 = 5.000 req/s, 30s binh thuong
  'Dot bien 20h-22h (2.000 -> 5.000 req/s trong 30s)': arrivals(120, (s) => (s >= 60 && s < 90 ? 5000 : 2000)),
  // Xung 1 giay 6.000 req/s bat dau giua giay (0,5s cuoi giay nay + 0,5s dau giay sau), lap moi 2 giay
  'Xung lech bien giay (6.000 req/s trong 1s, lap 30 lan)': Array.from({ length: 30 }, (_, k) =>
    pulse(k * 2000 + 500, k * 2000 + 1500, 6000),
  ).flat(),
};

function run(make: () => Algorithm, times: number[]) {
  const algo = make();
  const sent: number[] = [];
  let maxDelay = 0;
  for (const t of times) {
    const at = algo.tryAcquire(t);
    if (at === null) continue;
    sent.push(at);
    maxDelay = Math.max(maxDelay, at - t);
  }
  sent.sort((x, y) => x - y);
  return { accepted: sent.length, rejected: times.length - sent.length, maxRolling: maxInAnyWindow(sent, 1000), maxDelay };
}

for (const [name, times] of Object.entries(scenarios)) {
  const optimal = run(candidates['(b) Nhat ky cua so truot'], times).rejected;
  console.log(`\n=== ${name}: ${times.length} giao dich, muc chan toi thieu bat buoc = ${optimal}`);
  console.log('thuat toan                        | cho qua | bi chan | chan oan | max/1s truot | vuot? | tre toi da');
  for (const [algoName, make] of Object.entries(candidates)) {
    const r = run(make, times);
    const falseRejects = Math.max(0, r.rejected - optimal);
    console.log(
      `${algoName.padEnd(33)} | ${String(r.accepted).padStart(7)} | ${String(r.rejected).padStart(7)} | ${String(falseRejects).padStart(8)} | ${String(r.maxRolling).padStart(12)} | ${(r.maxRolling > LIMIT ? 'VUOT' : 'dat').padEnd(5)} | ${r.maxDelay.toFixed(0)}ms`,
    );
  }
}

// ---- Bo nho cho 100.000 khoa (trang thai day du) ----
const gc = (globalThis as { gc?: () => void }).gc;
function measure(make: () => Algorithm, keys: number) {
  gc?.();
  const before = process.memoryUsage().heapUsed + process.memoryUsage().arrayBuffers;
  const map = new Map<string, Algorithm>();
  for (let i = 0; i < keys; i++) {
    const a = make();
    // Lam day trang thai (nhat ky chua du 3.000 moc)
    for (let j = 0; j < LIMIT && a instanceof SlidingLogAlgorithm; j++) a.tryAcquire(j * 0.3);
    a.tryAcquire(0);
    map.set(`merchant:${i}`, a);
  }
  gc?.();
  const after = process.memoryUsage().heapUsed + process.memoryUsage().arrayBuffers;
  return { bytes: after - before, map };
}

console.log('\n=== Bo nho cho 100.000 khoa');
// Do nhat ky cua so truot sau cung: bo nho ArrayBuffer cua no duoc giai phong tre, lam sai so do cac thuat toan khac
const order = Object.entries(candidates).sort(([a], [b]) => Number(a.startsWith('(b)')) - Number(b.startsWith('(b)')));
for (const [algoName, make] of order) {
  // Nhat ky can ~24KB/khoa -> do tren 1.000 khoa roi nhan len de khong lam sap tien trinh do
  const sample = algoName.startsWith('(b)') ? 1000 : 100_000;
  const { bytes } = measure(make, sample);
  const total = (bytes * 100_000) / sample;
  console.log(`${algoName.padEnd(33)} | ${(total / 1048576).toFixed(1).padStart(8)} MB${sample < 100_000 ? ` (do ${sample} khoa x ${100_000 / sample})` : ''}`);
}
