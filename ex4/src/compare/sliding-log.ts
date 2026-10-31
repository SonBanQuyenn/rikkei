/**
 * Nhat ky cua so truot dung vong dem co dinh (ring buffer).
 *
 * Chi luu moc thoi gian cua request DUOC CHO QUA -> toi da `limit` phan tu,
 * bo nho co dinh `limit * 8` byte du dot bien lon den dau (request bi chan khong duoc ghi).
 *
 * Bat bien: voi moi request duoc cho qua tai t, so request duoc cho qua trong (t - windowMs, t] <= limit.
 * => khong bao gio vuot nguong trong BAT KY cua so dai windowMs nao, khong phu thuoc moc bat dau giay.
 */
export class SlidingLog {
  private readonly times: Float64Array;
  private head = 0; // vi tri phan tu cu nhat
  private size = 0;
  private last = -Infinity;

  constructor(
    readonly limit: number,
    readonly windowMs: number,
  ) {
    if (!Number.isInteger(limit) || limit <= 0) throw new RangeError('limit phai la so nguyen duong');
    if (!(windowMs > 0)) throw new RangeError('windowMs phai > 0');
    this.times = new Float64Array(limit);
  }

  /** Tra ve 0 neu cho qua, nguoc lai so ms can cho. */
  tryAcquire(now: number): number {
    // Dong ho lui (NTP chinh gio...) khong duoc lam hong bat bien
    if (now < this.last) now = this.last;
    this.last = now;

    if (this.size < this.limit) {
      this.times[(this.head + this.size) % this.limit] = now;
      this.size++;
      return 0;
    }
    const oldest = this.times[this.head];
    const waitMs = oldest + this.windowMs - now;
    if (waitMs > 0) return waitMs;

    // Phan tu cu nhat da ra khoi cua so -> ghi de no bang request moi
    this.times[this.head] = now;
    this.head = (this.head + 1) % this.limit;
    return 0;
  }
}
