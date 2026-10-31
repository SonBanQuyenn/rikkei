import { Queue, Worker, type ConnectionOptions, type Job, type WorkerOptions } from 'bullmq';
import { PermanentError, STEPS, TERMINAL_STATUSES, type Order, type OrderItem, type StepName } from '../domain/order.js';
import type { OrderRepository } from '../domain/order.repository.js';
import type { Integrations } from '../integrations/contracts.js';
import { PAYMENT_TIMEOUT_MS, WORKER_DEFAULTS, queueName, stepJobOptions } from '../config/pipeline.config.js';
import type { StepContext, StepHandler, StepResult } from './step.js';
import { reserveStockStep } from './steps/reserve-stock.step.js';
import { confirmPaymentStep } from './steps/confirm-payment.step.js';
import { issueInvoiceStep } from './steps/issue-invoice.step.js';
import { notifyCustomerStep } from './steps/notify-customer.step.js';
import { pushShippingStep } from './steps/push-shipping.step.js';

const HANDLERS: Record<StepName, StepHandler> = {
  'reserve-stock': reserveStockStep,
  'confirm-payment': confirmPaymentStep,
  'issue-invoice': issueInvoiceStep,
  'notify-customer': notifyCustomerStep,
  'push-shipping': pushShippingStep,
};

type StepJob = Job<{ orderId: string }>;

export type PipelineOptions = {
  connection: ConnectionOptions;
  prefix?: string;
  worker?: Partial<Omit<WorkerOptions, 'connection'>>;
  /** Ghi de thoi gian cho goc cua backoff (dung cho kiem thu/demo chay nhanh). */
  backoffOverrideMs?: number;
  paymentTimeoutMs?: number;
  log?: (msg: string) => void;
};

/**
 * Dieu phoi day chuyen: 5 hang doi, moi buoc xong thi
 *   (1) ghi ket qua + trang thai moi vao don (CSDL),
 *   (2) dua buoc ke tiep vao hang doi cua no (jobId = <orderId>-<buoc>, khong bao gio trung).
 * Neu tien trinh chet giua (1) va (2), job cua buoc hien tai bi coi la bo roi va chay lai: thay buoc da ghi
 * xong thi chi lam not (2). Khi khoi dong, recover() noi tiep moi don dang do tu buoc dang do.
 */
export class OrderPipeline {
  private readonly queues = new Map<StepName, Queue>();
  private readonly workers: Worker[] = [];
  private readonly ctx: StepContext;
  private readonly log: (msg: string) => void;

  constructor(
    private readonly repo: OrderRepository,
    deps: Integrations,
    private readonly opts: PipelineOptions,
  ) {
    this.ctx = { deps, repo, paymentTimeoutMs: opts.paymentTimeoutMs ?? PAYMENT_TIMEOUT_MS };
    this.log = opts.log ?? (() => {});
    for (const step of STEPS) {
      this.queues.set(step, new Queue(queueName(step), { connection: opts.connection, prefix: opts.prefix }));
    }
  }

  /** Dat don: ghi don trang thai PLACED roi dua vao buoc 1. */
  async placeOrder(input: { customer: Order['customer']; items: OrderItem[]; amount: number }) {
    const order = await this.repo.create(input);
    await this.enqueue(STEPS[0], order.id);
    return order;
  }

  startWorkers() {
    for (const step of STEPS) {
      const worker = new Worker(queueName(step), (job: StepJob) => this.handle(HANDLERS[step], job), {
        ...WORKER_DEFAULTS,
        ...this.opts.worker,
        connection: this.opts.connection,
        prefix: this.opts.prefix,
      });
      worker.on('failed', (job, err) =>
        this.log(`[${step}] ${job?.data.orderId.slice(0, 8)} lan ${job?.attemptsMade} loi: ${err.message}`),
      );
      worker.on('error', (err) => this.log(`[${step}] loi worker: ${err.message}`));
      this.workers.push(worker);
    }
  }

  /** Goi khi khoi dong: moi don chua ket thuc duoc dua lai vao dung buoc dang do (khong chay lai buoc da xong). */
  async recover() {
    const orders = await this.repo.listInProgress();
    for (const order of orders) await this.enqueueNext(order);
    return orders.length;
  }

  async close(force = false) {
    await Promise.all(this.workers.map((w) => w.close(force)));
    await Promise.all([...this.queues.values()].map((q) => q.close()));
  }

  async obliterate() {
    await Promise.all([...this.queues.values()].map((q) => q.obliterate({ force: true })));
  }

  // ------------------------------------------------------------------------------------------

  private async handle(step: StepHandler, job: StepJob) {
    const order = await this.repo.get(job.data.orderId);
    if (TERMINAL_STATUSES.includes(order.status)) return { skipped: 'order-finished' };

    // Job bi chay lai sau khi buoc da ghi xong (tien trinh chet truoc khi bao hoan tat) -> chi noi buoc ke.
    if (order.completedSteps.includes(step.name)) {
      await this.enqueueNext(order);
      return { skipped: 'step-already-done' };
    }

    let result: StepResult;
    try {
      result = await step.run(order, this.ctx);
    } catch (err) {
      const error = err as Error;
      const isFinal = error instanceof PermanentError || job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (!isFinal) throw error; // BullMQ thu lai theo backoff cua buoc
      result = await step.onFinalFailure(order, error, this.ctx);
    }

    const updated = await this.repo.completeStep(order.id, step.name, result.status, result.note, result.patch);
    this.log(`[${step.name}] ${order.id.slice(0, 8)} -> ${result.status}: ${result.note}`);
    await this.enqueueNext(updated);
    return { status: result.status };
  }

  private async enqueueNext(order: Order) {
    if (TERMINAL_STATUSES.includes(order.status)) return;
    const next = STEPS[order.completedSteps.length];
    if (next) await this.enqueue(next, order.id);
  }

  private enqueue(step: StepName, orderId: string) {
    return this.queues.get(step)!.add(step, { orderId }, stepJobOptions(step, orderId, this.opts.backoffOverrideMs));
  }
}
