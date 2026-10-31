// Tạo PDF hoá đơn và ghi lên S3 bằng credential tạm của Role.
import PDFDocument from 'pdfkit';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { s3 } from './aws-clients.js';
import { config } from './config.js';
import { query } from './db.js';

function renderPdf(order) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(20).text('ShopFast - INVOICE', { align: 'center' }).moveDown();
    doc.fontSize(11).text(`Order: ${order.id}`).text(`Customer: ${order.customer_name}`);
    doc.text(`Date: ${new Date(order.created_at).toISOString().slice(0, 10)}`).moveDown();
    for (const item of order.items) {
      doc.text(`${item.name}  x${item.qty}  ${item.price.toLocaleString('vi-VN')} VND`);
    }
    doc.moveDown().fontSize(13).text(`Total: ${Number(order.total).toLocaleString('vi-VN')} VND`);
    doc.end();
  });
}

export async function loadOrder(orderId) {
  const { rows } = await query(
    `SELECT o.id, o.customer_name, o.created_at, o.total,
            json_agg(json_build_object('name', i.name, 'qty', i.qty, 'price', i.price)) AS items
       FROM orders o JOIN order_items i ON i.order_id = o.id
      WHERE o.id = $1
      GROUP BY o.id`,
    [orderId]
  );
  if (!rows.length) throw new Error(`Không tìm thấy đơn hàng ${orderId}`);
  return rows[0];
}

/** Ghi PDF vào s3://<bucket>/invoices/YYYY/MM/<orderId>.pdf - đúng tiền tố mà chính sách cho phép. */
export async function createInvoice(orderId) {
  const order = await loadOrder(orderId);
  const pdf = await renderPdf(order);
  const d = new Date(order.created_at);
  const key = `invoices/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${order.id}.pdf`;

  await s3.send(
    new PutObjectCommand({
      Bucket: config.invoiceBucket,
      Key: key,
      Body: pdf,
      ContentType: 'application/pdf',
      ServerSideEncryption: 'aws:kms',
    })
  );
  await query('UPDATE orders SET invoice_key = $1 WHERE id = $2', [key, order.id]);
  return { bucket: config.invoiceBucket, key, bytes: pdf.length };
}
