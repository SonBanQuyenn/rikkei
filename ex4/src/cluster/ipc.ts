import type { Worker } from 'node:cluster';
import type { Coordinator, Decision } from '../limiter/coordinator.js';
import type { CoordinatorTransport } from '../limiter/distributed-limiter.js';

type AcquireMsg = { type: 'acquire'; id: number; key: string };
type DecisionMsg = { type: 'decision'; id: number; decision: Decision };

/** Phia tien trinh gateway: gui yeu cau qua kenh IPC toi tien trinh chu (bo dieu phoi). */
export class IpcTransport implements CoordinatorTransport {
  private seq = 0;
  private pending = new Map<number, (d: Decision) => void>();

  constructor() {
    process.on('message', (msg: DecisionMsg) => {
      if (msg?.type !== 'decision') return;
      this.pending.get(msg.id)?.(msg.decision);
      this.pending.delete(msg.id);
    });
  }

  acquire(key: string): Promise<Decision> {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, resolve);
      process.send!({ type: 'acquire', id, key } satisfies AcquireMsg, (err: Error | null) => {
        if (err) {
          this.pending.delete(id);
          reject(err);
        }
      });
    });
  }
}

/** Phia tien trinh chu: nhan yeu cau tu moi worker, hoi Coordinator (don luong -> nguyen tu). */
export function serveCoordinator(
  worker: Worker,
  coordinator: Coordinator,
  clock: () => number,
  onDecision?: (key: string, at: number, d: Decision) => void,
) {
  worker.on('message', (msg: AcquireMsg) => {
    if (msg?.type !== 'acquire') return;
    const now = clock();
    const decision = coordinator.acquire(msg.key, now);
    onDecision?.(msg.key, now, decision);
    if (worker.isConnected()) worker.send({ type: 'decision', id: msg.id, decision } satisfies DecisionMsg);
  });
}
