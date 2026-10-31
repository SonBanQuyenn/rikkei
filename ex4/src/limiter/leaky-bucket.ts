/**
 * Gao ro dang lap lich ao (virtual scheduling): moi khoa chi can MOT so `nextSlot`.
 *
 * Giao dich duoc xep vao khe gui ke tiep, cac khe cach nhau dung `1000 / rate` ms:
 * - khe trong ngay -> gui luon (delay 0);
 * - khe con trong vong `maxDelayMs` -> cho qua nhung gui tre (hang doi hap thu xung ngan);
 * - khe xa hon `maxDelayMs` -> hang doi day, chan.
 *
 * Bat bien: hai giao dich duoc cho qua co thoi diem gui cach nhau >= 1000 / rate ms
 * => trong BAT KY 1 giay nao cung khong qua `rate` giao dich (rate <= 3.000).
 */
export class LeakyBucket {
  private readonly gapMs: number;
  private nextSlot = -Infinity;
  private last = -Infinity;

  constructor(
    readonly rate: number,
    readonly maxDelayMs: number,
  ) {
    if (!(rate > 0)) throw new RangeError('rate phai > 0');
    if (!(maxDelayMs >= 0)) throw new RangeError('maxDelayMs phai >= 0');
    this.gapMs = 1000 / rate;
  }

  /** Tra ve so ms phai cho truoc khi gui, hoac null neu bi chan. */
  schedule(now: number): number | null {
    // Dong ho lui (NTP chinh gio...) khong duoc lam hong bat bien
    if (now < this.last) now = this.last;
    this.last = now;

    const sendAt = Math.max(now, this.nextSlot);
    const delay = sendAt - now;
    if (delay > this.maxDelayMs) return null;
    this.nextSlot = sendAt + this.gapMs;
    return delay;
  }

  /** Thoi gian cho toi khi hang doi co cho trong lai. */
  retryAfter(now: number) {
    return Math.max(0, this.nextSlot - this.maxDelayMs - now);
  }

  /** Hang doi da rong hoan toan -> trang thai giong het khoa moi, xoa an toan. */
  isIdle(now: number) {
    return now >= this.nextSlot;
  }
}
