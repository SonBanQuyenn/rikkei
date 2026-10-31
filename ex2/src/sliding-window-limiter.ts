type Counter = { prev: number; curr: number; windowStart: number };

export class SlidingWindowLimiter {
  private counters = new Map<string, Counter>();
  private readonly windowMs = 60_000;
  private readonly limit = 100;

  isAllowed(key: string, now: number): boolean {
    const windowStart = Math.floor(now / this.windowMs) * this.windowMs;
    // Khoa chua tung xuat hien -> bat dau tu 0, khong nem loi
    const c = this.counters.get(key) ?? { prev: 0, curr: 0, windowStart };

    // (1) xoay vong khi da sang cua so moi
    if (windowStart !== c.windowStart) {
      // Chi cua so LIEN KE truoc moi con anh huong; cach xa hon (vd 10 phut) -> so dem cu het han
      c.prev = windowStart - c.windowStart === this.windowMs ? c.curr : 0;
      c.curr = 0;
      c.windowStart = windowStart;
    }

    // (2) ti le phan con lai cua cua so truoc nam trong 60s gan nhat
    const prevWeight = (this.windowMs - (now - windowStart)) / this.windowMs;

    // (3) uoc luong tong so request trong 60s vua qua
    const estimated = c.prev * prevWeight + c.curr;

    // (4) so sanh voi han muc de quyet dinh cho qua hay chan
    if (estimated >= this.limit) {
      this.counters.set(key, c);
      return false;
    }

    // (5) tang bo dem khi request duoc cho qua
    c.curr++;
    this.counters.set(key, c);
    return true;
  }
}
