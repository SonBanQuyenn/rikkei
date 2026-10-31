// email.processor.ts (BAN GOC) - chay duoc, khong loi cu phap, nhung sai logic
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { MailerService } from '../mailer/mailer.service.js';

@Processor('order-email')
export class BuggyEmailProcessor extends WorkerHost {
  constructor(private mailer: MailerService) { super(); }

  async process(job: Job<{ orderId: string; email: string }>) {
    await this.mailer.sendConfirmation(job.data.email, job.data.orderId);
    return { sent: true };
  }
}
