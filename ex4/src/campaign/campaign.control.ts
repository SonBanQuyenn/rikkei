import type { Queue } from 'bullmq';
import type { CampaignStats } from './campaign.stats.js';
import type { CampaignJob } from './campaign.loader.js';

/**
 * Dieu khien chien dich giua chung. Hang doi chien dich tach rieng nen tam dung/huy
 * khong dong cham toi email giao dich.
 */
export class CampaignControl {
  constructor(
    private readonly queue: Queue<CampaignJob>,
    private readonly stats: CampaignStats,
  ) {}

  /** Tam dung toan cuc: moi tien trinh ngung lay job moi ngay; job dang goi do (toi da vai chuc) chay not. */
  async pause() {
    await this.queue.pause();
    await this.stats.setState('paused');
  }

  async resume() {
    await this.stats.setState('running');
    await this.queue.resume();
  }

  /** Dung han (phat hien noi dung sai): danh dau huy truoc de job da lay ra cung khong gui, roi xoa phan con lai. */
  async cancel() {
    await this.stats.setState('cancelled');
    await this.queue.pause();
    const left = await this.queue.getJobCountByTypes('wait', 'delayed', 'prioritized');
    await this.queue.drain(true);
    await this.stats.incr('cancelled', left);
    return left;
  }
}
