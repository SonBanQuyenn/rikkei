import type { Redis } from 'ioredis';

export type CampaignState = 'running' | 'paused' | 'cancelled';

const FIELDS = [
  'total', //              so dong trong danh sach goc
  'queued', //             da dua vao hang doi (hop le, khong trung)
  'invalidFormat', //      sai dinh dang - loai ngay khi nap, khong ton luot goi
  'duplicates', //         trung khach / trung email - loai khi nap
  'sent', //               gui thanh cong
  'invalidRecipient', //   nha cung cap bao khong ton tai - khong thu lai
  'failed', //             loi tam thoi het so lan thu
  'cancelled', //          bo qua vi chien dich bi dung han
  'alreadySent', //        job bi chay lai nhung email da gui truoc do -> khong gui lai
] as const;
export type StatField = (typeof FIELDS)[number];

/** Tien do chien dich theo thoi gian thuc: bo dem nguyen tu trong Redis, moi tien trinh cung cap nhat. */
export class CampaignStats {
  constructor(
    private readonly redis: Redis,
    readonly campaignId: string,
  ) {}

  private get key() {
    return `campaign:${this.campaignId}:stats`;
  }
  private get stateKey() {
    return `campaign:${this.campaignId}:state`;
  }

  incr(field: StatField, by = 1) {
    return this.redis.hincrby(this.key, field, by);
  }

  async setLoaded(values: Pick<Record<StatField, number>, 'total' | 'queued' | 'invalidFormat' | 'duplicates'>) {
    await this.redis.hset(this.key, { ...values, startedAt: Date.now() });
    await this.redis.set(this.stateKey, 'running', 'NX');
  }

  async state(): Promise<CampaignState> {
    return ((await this.redis.get(this.stateKey)) as CampaignState | null) ?? 'running';
  }

  setState(state: CampaignState) {
    return this.redis.set(this.stateKey, state);
  }

  async progress() {
    const raw = await this.redis.hgetall(this.key);
    const n = Object.fromEntries(FIELDS.map((f) => [f, Number(raw[f] ?? 0)])) as Record<StatField, number>;
    const done = n.sent + n.invalidRecipient + n.failed + n.cancelled + n.alreadySent;
    const elapsedSec = raw.startedAt ? (Date.now() - Number(raw.startedAt)) / 1000 : 0;
    const ratePerSec = elapsedSec > 0 ? n.sent / elapsedSec : 0;
    const remaining = Math.max(0, n.queued - done);
    return {
      ...n,
      state: await this.state(),
      done,
      remaining,
      percent: n.queued ? Math.round((done / n.queued) * 1000) / 10 : 0,
      ratePerSec: Math.round(ratePerSec * 10) / 10,
      etaSec: ratePerSec > 0 ? Math.round(remaining / ratePerSec) : null,
    };
  }

  async clear() {
    const keys = await this.redis.keys(`campaign:${this.campaignId}:*`);
    if (keys.length) await this.redis.del(...keys);
  }
}
