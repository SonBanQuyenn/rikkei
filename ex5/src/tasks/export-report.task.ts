import { InvalidPayloadError, requireFields, type TaskDefinition } from './task.types.js';

export type ExportReportData = { reportId: string; month: string };

/** Viec nang: tong hop doanh thu tung ngay trong thang roi luu tep. Ghi de theo reportId -> chay lai an toan. */
export const exportReportTask: TaskDefinition<ExportReportData> = {
  name: 'export-report',
  queue: 'heavy',
  parse(d) {
    const data = requireFields<ExportReportData>(d, ['reportId', 'month']);
    if (!/^\d{4}-\d{2}$/.test(data.month)) throw new InvalidPayloadError(`Thang khong hop le: ${data.month}`);
    return data;
  },
  idempotencyKey: (d) => `report:${d.reportId}`,
  async run(d, { ports, progress }) {
    const rows: string[] = ['ngay,doanh_thu'];
    for (let day = 1; day <= 30; day++) {
      rows.push(`${d.month}-${String(day).padStart(2, '0')},${await ports.sales.revenueOfDay(d.month, day)}`);
      if (day % 5 === 0) await progress(Math.round((day / 30) * 100));
    }
    const url = await ports.storage.save(d.reportId, rows.join('\n'));
    return { url };
  },
};
