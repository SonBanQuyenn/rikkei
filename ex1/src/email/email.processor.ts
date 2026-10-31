import { Inject } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { MailerService } from '../mailer/mailer.service.js';
import { EmailIdempotencyStore } from './email-idempotency.store.js';
import { EMAIL_QUEUE, type ConfirmationJobData, type ConfirmationJobResult } from './email.constants.js';

@Processor(EMAIL_QUEUE, { concurrency: 10 })
export class EmailProcessor extends WorkerHost {
  constructor(
    @Inject(MailerService) private readonly mailer: MailerService,
    @Inject(EmailIdempotencyStore) private readonly sentStore: EmailIdempotencyStore,
  ) {
    super();
  }

  async process(job: Job<ConfirmationJobData>): Promise<ConfirmationJobResult> {
    const { orderId, email } = job.data;

    // 1. Lan thu lai / job bi chay lai sau khi da gui xong -> bo qua, khong gui lan hai.
    const sentId = await this.sentStore.sentMessageId(orderId);
    if (sentId) return { sent: false, skipped: 'already-sent', messageId: sentId };

    // 2. Gui kem khoa idempotency theo don: neu lan truoc nha cung cap da nhan thu nhung phan hoi
    //    bi mat (timeout) hoac tien trinh chet truoc buoc 3, lan nay nha cung cap tra lai thu cu.
    const { messageId } = await this.mailer.sendConfirmation(
      email,
      orderId,
      EmailIdempotencyStore.providerKey(orderId),
    );

    // 3. Ghi dau da gui (co TTL) truoc khi job hoan tat.
    await this.sentStore.markSent(orderId, messageId);
    return { sent: true, messageId };
  }
}
