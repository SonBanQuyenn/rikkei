import { Inject, Logger, type OnModuleDestroy } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { INVOICE_QUEUE, SHUTDOWN_GRACE_MS, invoiceWorkerOptions } from '../config/queue.config.js';
import { PdfRenderer, StorageService, type InvoiceJobData } from './invoice.services.js';

@Processor(INVOICE_QUEUE, invoiceWorkerOptions)
export class InvoiceProcessor extends WorkerHost implements OnModuleDestroy {
  private readonly logger = new Logger(InvoiceProcessor.name);
  private readonly running = new Set<string>();

  constructor(
    @Inject(PdfRenderer) private readonly pdf: PdfRenderer,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {
    super();
  }

  async process(job: Job<InvoiceJobData>) {
    this.running.add(job.data.invoiceId);
    try {
      const pdf = await this.pdf.render(job.data); // mat ~1200 ms
      await this.storage.upload(pdf);
      return { ok: true };
    } finally {
      this.running.delete(job.data.invoiceId);
    }
  }

  // (2) Hook chay khi module bi huy (app.close() sau khi nhan SIGTERM/SIGINT) de dong worker co trat tu.
  async onModuleDestroy() {
    this.logger.log(
      `Dang tat: ngung nhan job moi, cho ${this.running.size} job dang chay [${[...this.running].join(', ')}] (toi da ${SHUTDOWN_GRACE_MS} ms)`,
    );
    const started = Date.now();

    // Ngung lay job moi ngay lap tuc, job dang chay van tiep tuc va van duoc gia han khoa.
    await this.worker.pause(true);

    // (3) Cho job dang chay xong, nhung toi da SHUTDOWN_GRACE_MS. Khong dung worker.close() de cho vi
    //     close() khong tu het gio va chi chay mot lan (goi close(true) sau do khong con tac dung).
    const finished = await this.waitUntilIdle(SHUTDOWN_GRACE_MS);

    if (finished) {
      await this.worker.close(); // khong con job dang chay -> dong ngay, ghi nhan completed day du
      this.logger.log(`Worker da dong sau ${Date.now() - started} ms, moi job dang chay deu hoan tat`);
      return;
    }
    // Qua thoi gian cho: dong cuong buc. Job do van o trang thai active voi khoa KHONG con duoc gia han;
    // het lockDuration, worker con song se thay job bi bo roi va giao lai -> khong mat, khong treo.
    this.logger.warn(
      `Qua ${SHUTDOWN_GRACE_MS} ms van con [${[...this.running].join(', ')}] - dong cuong buc, job se duoc worker khac nhan lai`,
    );
    await this.worker.close(true);
  }

  private async waitUntilIdle(timeoutMs: number) {
    const deadline = Date.now() + timeoutMs;
    while (this.running.size > 0) {
      if (Date.now() >= deadline) return false;
      await new Promise((r) => setTimeout(r, 50));
    }
    return true;
  }

  @OnWorkerEvent('active')
  onActive(job: Job<InvoiceJobData>) {
    this.logger.log(`Bat dau ${job.data.invoiceId} (lan ${job.attemptsStarted})`);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<InvoiceJobData>) {
    this.logger.log(`Hoan tat ${job.data.invoiceId}`);
  }

  @OnWorkerEvent('error')
  onError(err: Error) {
    this.logger.error(`Loi worker: ${err.message}`);
  }
}
