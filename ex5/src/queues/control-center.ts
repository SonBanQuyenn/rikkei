import { Queue, UnrecoverableError, Worker, type ConnectionOptions, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import { IdempotencyGuard } from '../common/idempotency.js';
import { errorMessage, type Logger } from '../common/logger.js';
import {
  MONITOR,
  QUEUES,
  QUEUE_KEYS,
  SCHEDULES,
  type MonitorConfig,
  type QueueConfig,
  type QueueKey,
  type ScheduleConfig,
} from '../config/queues.config.js';
import { AlertMonitor } from '../monitoring/alert-monitor.js';
import type { DashboardSnapshot, QueueSnapshot } from '../monitoring/dashboard.types.js';
import { QueueMetrics } from '../monitoring/metrics.js';
import type { AlertNotifier } from '../monitoring/notifiers.js';
import { TASKS } from '../tasks/index.js';
import type { Ports } from '../tasks/ports.js';
import type { TaskDefinition } from '../tasks/task.types.js';

export type ControlCenterOptions = {
  connection: ConnectionOptions;
  redis: Redis;
  /** Tien to khoa (BullMQ, chi so, chong lap) - tach moi truong. */
  ns: string;
  ports: Ports;
  notifiers: AlertNotifier[];
  logger: Logger;
  queues?: Record<QueueKey, QueueConfig>;
  schedules?: ScheduleConfig[];
  monitor?: MonitorConfig;
};

/**
 * Trung tam dieu hanh: dung hang doi/worker tu cau hinh, dinh tuyen job toi tac vu nghiep vu,
 * bao boc chong lap, ghi chi so, chup bang dieu khien va chay vong canh bao.
 */
export class ControlCenter {
  readonly queues: Record<QueueKey, Queue>;
  readonly metrics: QueueMetrics;
  readonly monitor: AlertMonitor;
  readonly cfg: Record<QueueKey, QueueConfig>;
  private readonly workers = new Map<QueueKey, Worker>();
  private readonly tasks = new Map<string, TaskDefinition>(TASKS.map((t) => [t.name, t]));
  private readonly guard: IdempotencyGuard;
  private readonly schedules: ScheduleConfig[];
  private readonly monitorCfg: MonitorConfig;
  private readonly startedAt = Date.now();

  constructor(private readonly opts: ControlCenterOptions) {
    this.cfg = opts.queues ?? QUEUES;
    this.schedules = opts.schedules ?? SCHEDULES;
    this.monitorCfg = opts.monitor ?? MONITOR;
    this.metrics = new QueueMetrics(opts.redis, opts.ns);
    this.guard = new IdempotencyGuard(opts.redis, `${opts.ns}:idem`);
    this.queues = Object.fromEntries(
      QUEUE_KEYS.map((k) => [k, new Queue(this.cfg[k].name, { connection: opts.connection, prefix: opts.ns })]),
    ) as Record<QueueKey, Queue>;
    for (const q of Object.values(this.queues)) q.on('error', (err) => opts.logger.error(`Queue: ${err.message}`));
    this.monitor = new AlertMonitor(
      () => this.snapshot(),
      Object.fromEntries(QUEUE_KEYS.map((k) => [k, this.cfg[k].alerts])) as Record<QueueKey, QueueConfig['alerts']>,
      this.monitorCfg,
      opts.notifiers,
      opts.logger,
    );
  }

  async start(workerKeys: readonly QueueKey[] = QUEUE_KEYS) {
    for (const key of workerKeys) this.startWorker(key);
    for (const s of this.schedules) {
      await this.queues.scheduled.upsertJobScheduler(s.id, { every: s.everyMs }, { name: s.task, data: {}, opts: this.cfg.scheduled.job });
    }
    this.monitor.start();
  }

  startWorker(key: QueueKey) {
    if (this.workers.has(key)) return;
    const { logger } = this.opts;
    const worker = new Worker(this.cfg[key].name, (job) => this.process(key, job), {
      ...this.cfg[key].worker,
      connection: this.opts.connection,
      prefix: this.opts.ns,
    });
    worker.on('completed', (job) => void this.onCompleted(key, job).catch((e) => logger.error(errorMessage(e))));
    worker.on('failed', (job, err) => void this.onFailed(key, job, err).catch((e) => logger.error(errorMessage(e))));
    worker.on('stalled', (jobId) => logger.warn(`${key}: job ${jobId} bi bo roi, dua lai hang doi`));
    worker.on('error', (err) => logger.error(`Worker ${key}: ${err.message}`));
    this.workers.set(key, worker);
  }

  async stopWorker(key: QueueKey) {
    await this.workers.get(key)?.close();
    this.workers.delete(key);
  }

  /** Dua tac vu vao dung hang doi; jobId suy ra tu khoa nghiep vu -> them lap khong tao job trung. */
  async enqueue(taskName: string, data: unknown) {
    const task = this.tasks.get(taskName);
    if (!task) throw new Error(`Khong co tac vu ${taskName}`);
    const parsed = task.parse(data);
    const jobId = task.idempotencyKey(parsed).replace(/:/g, '-');
    return this.queues[task.queue].add(task.name, parsed, { ...this.cfg[task.queue].job, jobId });
  }

  async snapshot(): Promise<DashboardSnapshot> {
    const now = Date.now();
    const queues = await Promise.all(QUEUE_KEYS.map((k) => this.queueSnapshot(k, now)));
    const schedules = await Promise.all(
      this.schedules.map(async (s) => {
        const last = await this.metrics.lastSuccess(s.id);
        return { id: s.id, everyMs: s.everyMs, staleAfterMs: s.staleAfterMs, lastSuccessAt: last, sinceSuccessMs: now - (last ?? this.startedAt) };
      }),
    );
    return { at: now, queues, schedules };
  }

  activeAlerts() {
    return this.monitor.activeAlerts();
  }

  async close() {
    this.monitor.stop();
    await Promise.allSettled([...this.workers.values()].map((w) => w.close()));
    await Promise.allSettled(Object.values(this.queues).map((q) => q.close()));
  }

  async obliterate() {
    for (const q of Object.values(this.queues)) {
      await q.obliterate({ force: true }).catch(() => {});
    }
    const keys = await this.opts.redis.keys(`${this.opts.ns}:*`);
    if (keys.length) await this.opts.redis.del(...keys);
  }

  // ------------------------------------------------------------------------------------------

  private async process(key: QueueKey, job: Job) {
    const task = this.tasks.get(job.name);
    if (!task || task.queue !== key) throw new UnrecoverableError(`Hang doi ${key} khong xu ly tac vu "${job.name}"`);

    let data: unknown;
    try {
      // Job do lich tao ra: moc lich (thoi diem tao) la mot phan cua khoa chong lap.
      const raw = key === 'scheduled' ? { scheduledAt: job.timestamp, ...job.data } : job.data;
      data = task.parse(raw);
    } catch (err) {
      throw new UnrecoverableError(`Du lieu khong hop le: ${errorMessage(err)}`); // thu lai vo ich
    }

    const lockTtl = this.cfg[key].worker.lockDuration ?? 30_000;
    const res = await this.guard.runOnce(task.idempotencyKey(data), lockTtl, () =>
      task.run(data, { ports: this.opts.ports, progress: (p) => job.updateProgress(p) }),
    );
    return res.skipped ? { skipped: 'da-chay-truoc-do' } : res.result;
  }

  private async onCompleted(key: QueueKey, job: Job) {
    await this.metrics.record(key, 'completed');
    if (key === 'scheduled') {
      for (const s of this.schedules.filter((x) => x.task === job.name)) await this.metrics.heartbeat(s.id);
    }
  }

  private async onFailed(key: QueueKey, job: Job | undefined, err: Error) {
    await this.metrics.record(key, 'failed');
    if (!job) return;
    const final = err instanceof UnrecoverableError || err.name === 'UnrecoverableError' || job.attemptsMade >= (job.opts.attempts ?? 1);
    if (final) {
      await this.metrics.record(key, 'deadLetter');
      this.opts.logger.error(`${key}/${job.name} ${job.id} that bai han sau ${job.attemptsMade} lan: ${err.message}`);
    }
  }

  private async queueSnapshot(key: QueueKey, now: number): Promise<QueueSnapshot> {
    const q = this.queues[key];
    const [c, workers, paused, head, win] = await Promise.all([
      q.getJobCounts('wait', 'prioritized', 'active', 'delayed', 'completed', 'failed'),
      q.getWorkersCount(),
      q.isPaused(),
      q.getJobs(['wait', 'prioritized'], 0, 49, true), // dau hang doi: cac job cho lau nhat
      this.metrics.window(key, this.monitorCfg.failureWindowMs),
    ]);
    const oldest = head.filter(Boolean).map((j) => j.timestamp);
    return {
      key,
      name: this.cfg[key].name,
      purpose: this.cfg[key].purpose,
      paused,
      workers,
      waiting: c.wait + c.prioritized,
      active: c.active,
      delayed: c.delayed,
      completed: c.completed,
      failed: c.failed,
      oldestWaitingMs: oldest.length ? now - Math.min(...oldest) : null,
      window: { ...win, ms: this.monitorCfg.failureWindowMs },
    };
  }
}
