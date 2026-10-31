import type { TaskDefinition } from './task.types.js';
import { sendOtpTask } from './send-otp.task.js';
import { exportReportTask } from './export-report.task.js';
import { inventorySyncTask } from './inventory-sync.task.js';
import { bulkPriceTask } from './bulk-price.task.js';

export const TASKS: TaskDefinition<any>[] = [sendOtpTask, exportReportTask, inventorySyncTask, bulkPriceTask];
export { sendOtpTask, exportReportTask, inventorySyncTask, bulkPriceTask };
