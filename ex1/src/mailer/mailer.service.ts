import { Injectable } from '@nestjs/common';

export type SendMailRequest = {
  to: string;
  subject: string;
  body: string;
  /** Header Idempotency-Key: nha cung cap tra lai ket qua cu, khong gui lan hai neu da nhan khoa nay. */
  idempotencyKey?: string;
};

export interface MailProvider {
  send(req: SendMailRequest): Promise<{ messageId: string }>;
}

/** Nha cung cap mac dinh khi chay thu: chi ghi log. */
export class ConsoleMailProvider implements MailProvider {
  private seq = 0;
  async send(req: SendMailRequest) {
    const messageId = `msg-${++this.seq}`;
    console.log(`[mail] -> ${req.to} | ${req.subject} | key=${req.idempotencyKey ?? '-'} | ${messageId}`);
    return { messageId };
  }
}

@Injectable()
export class MailerService {
  constructor(private readonly provider: MailProvider) {}

  sendConfirmation(email: string, orderId: string, idempotencyKey?: string) {
    return this.provider.send({
      to: email,
      subject: `ShopFast - Xac nhan don hang ${orderId}`,
      body: `Cam on ban da dat hang. Ma don: ${orderId}`,
      idempotencyKey,
    });
  }
}
