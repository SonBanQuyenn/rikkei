import { Injectable } from '@nestjs/common';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export type InvoiceJobData = { invoiceId: string; renderMs?: number };

/** Luu tep PDF (gia lap object storage bang thu muc cuc bo). */
@Injectable()
export class StorageService {
  readonly dir = process.env.STORAGE_DIR ?? '.data/invoices';

  async upload(pdf: { invoiceId: string; content: Buffer }) {
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, `${pdf.invoiceId}.pdf`), pdf.content);
  }
}

/** Dung PDF hoa don - mat khoang 1200 ms. */
@Injectable()
export class PdfRenderer {
  async render(data: InvoiceJobData) {
    await new Promise((r) => setTimeout(r, data.renderMs ?? 1200));
    return { invoiceId: data.invoiceId, content: Buffer.from(`%PDF-1.7 hoa don ${data.invoiceId}`) };
  }
}
