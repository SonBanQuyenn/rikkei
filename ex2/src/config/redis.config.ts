import type { ConnectionOptions } from 'bullmq';

const url = new URL(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379');

/** Ket noi Redis dung chung cho BullMQ va kho chong trung. */
export const redisConnection: ConnectionOptions & { host: string; port: number } = {
  host: url.hostname,
  port: Number(url.port || 6379),
  maxRetriesPerRequest: null,
};
