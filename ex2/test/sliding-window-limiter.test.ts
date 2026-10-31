import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { SlidingWindowLimiter } from '../src/sliding-window-limiter.js';

const SEC = 1000;

/** Ban cua so CO DINH (thuat toan cu) - dung de doi chieu kich ban tan cong. */
class FixedWindowLimiter {
  private counters = new Map<string, { windowStart: number; count: number }>();
  isAllowed(key: string, now: number): boolean {
    const windowStart = Math.floor(now / 60_000) * 60_000;
    const c = this.counters.get(key);
    if (!c || c.windowStart !== windowStart) {
      this.counters.set(key, { windowStart, count: 1 });
      return true;
    }
    if (c.count >= 100) return false;
    c.count++;
    return true;
  }
}

/** Ban `count` request vao giay `second`, tra ve so request duoc cho qua. */
function burst(limiter: { isAllowed(key: string, now: number): boolean }, key: string, second: number, count: number) {
  let allowed = 0;
  for (let i = 0; i < count; i++) {
    // rai deu trong giay do
    if (limiter.isAllowed(key, second * SEC + Math.floor((i * SEC) / count))) allowed++;
  }
  return allowed;
}

describe('Kich ban tan cong bien: 100 lan o giay 59, 100 lan o giay 61', () => {
  test('cua so co dinh (thuat toan cu) cho lot ca 200 request trong 2 giay', () => {
    const limiter = new FixedWindowLimiter();
    const total = burst(limiter, 'acc', 59, 100) + burst(limiter, 'acc', 61, 100);
    assert.equal(total, 200);
  });

  test('cua so truot chan dot thu hai', () => {
    const limiter = new SlidingWindowLimiter();
    assert.equal(burst(limiter, 'acc', 59, 100), 100);

    const second = burst(limiter, 'acc', 61, 100);
    // Trong giay 61, cua so truoc con chiem ~59/60 -> 58/60 => uoc luong ~97-98 request.
    // Chi con vai suat le, gan nhu toan bo dot tan cong thu hai bi chan.
    assert.ok(second <= 5, `cho qua ${second} request o giay 61`);
    assert.ok(100 - second >= 95);
  });

  test('han muc duoc phuc hoi dan khi cua so truoc truot ra ngoai', () => {
    const limiter = new SlidingWindowLimiter();
    burst(limiter, 'acc', 59, 100);
    // Dung giay 90: cua so truoc con 50% => uoc luong 50, chi con 50 suat
    let allowed = 0;
    for (let i = 0; i < 100; i++) if (limiter.isAllowed('acc', 90 * SEC)) allowed++;
    assert.equal(allowed, 50);
  });

  test('moi tai khoan co bo dem rieng', () => {
    const limiter = new SlidingWindowLimiter();
    burst(limiter, 'attacker', 59, 100);
    assert.equal(burst(limiter, 'attacker', 61, 100) <= 5, true);
    assert.equal(burst(limiter, 'normal-user', 61, 100), 100);
  });
});

describe('Bay du lieu', () => {
  test('khoa chua tung xuat hien - xu ly duoc, khong nem loi', () => {
    const limiter = new SlidingWindowLimiter();
    assert.doesNotThrow(() => limiter.isAllowed('never-seen', 123_456));
    assert.equal(new SlidingWindowLimiter().isAllowed('never-seen', 0), true);
  });

  test('khoa xuat hien lan cuoi cach day 10 phut - so dem cu het han, khong cong don', () => {
    const limiter = new SlidingWindowLimiter();
    assert.equal(burst(limiter, 'acc', 59, 100), 100);
    assert.equal(limiter.isAllowed('acc', 59_999), false);

    // 10 phut sau, ngay dau mot cua so moi (prevWeight ~ 1): neu cong don so dem cu se bi chan
    const tenMinutesLater = 59 * SEC + 10 * 60 * SEC;
    const at = Math.floor(tenMinutesLater / 60_000) * 60_000;
    let allowed = 0;
    for (let i = 0; i < 100; i++) if (limiter.isAllowed('acc', at + i)) allowed++;
    assert.equal(allowed, 100);
    assert.equal(limiter.isAllowed('acc', at + 100), false);
  });
});
