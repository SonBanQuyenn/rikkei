import { Body, Controller, Module, Post } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { redisConnection } from './config/redis.config.js';
import { BULL_PREFIX, INVOICE_QUEUE } from './config/queue.config.js';
import { InvoiceProcessor } from './invoice/invoice.processor.js';
import { PdfRenderer, StorageService, type InvoiceJobData } from './invoice/invoice.services.js';

@Controller('invoices')
export class InvoiceController {
  constructor(@InjectQueue(INVOICE_QUEUE) private readonly queue: Queue<InvoiceJobData>) {}

  @Post('export')
  async export(@Body() body: { invoiceId: string }) {
    const job = await this.queue.add('export', { invoiceId: body.invoiceId }, { jobId: `invoice-${body.invoiceId}` });
    return { jobId: job.id };
  }
}

@Module({
  imports: [
    BullModule.forRoot({ connection: redisConnection, prefix: BULL_PREFIX }),
    BullModule.registerQueue({ name: INVOICE_QUEUE }),
  ],
  controllers: [InvoiceController],
  providers: [InvoiceProcessor, PdfRenderer, StorageService],
})
export class AppModule {}
