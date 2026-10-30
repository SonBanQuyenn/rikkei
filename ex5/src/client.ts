import { io, type Socket } from 'socket.io-client';
import { S2C, type Ack } from './contracts/events.js';

export interface Received {
  event: string;
  data: any;
}

/** Client mau cho moi vai tro: ghi lai moi su kien server -> client nhan duoc. */
export class RoleClient {
  readonly socket: Socket;
  readonly received: Received[] = [];

  constructor(
    url: string,
    token: string,
    readonly label: string,
    private readonly log: (who: string, msg: string) => void = () => {},
  ) {
    this.socket = io(url, { auth: { token }, transports: ['websocket'], forceNew: true, reconnection: false });
    for (const event of Object.values(S2C)) {
      this.socket.on(event, (data) => {
        this.received.push({ event, data });
        this.log(label, `<- ${event} ${summarize(data)}`);
      });
    }
  }

  connected() {
    return new Promise<void>((resolve, reject) => {
      if (this.socket.connected) return resolve();
      this.socket.once('connect', () => resolve());
      this.socket.once('connect_error', reject);
    });
  }

  async call<T = any>(event: string, payload: unknown): Promise<Ack<T>> {
    const res: Ack<T> = await this.socket.timeout(3000).emitWithAck(event, payload);
    this.log(this.label, `-> ${event} ${summarize(payload)} => ${res.ok ? 'OK' : `LOI: ${res.error}`}`);
    return res;
  }

  of(event: string) {
    return this.received.filter((r) => r.event === event).map((r) => r.data);
  }

  disconnect() {
    this.socket.close();
  }
}

function summarize(data: unknown): string {
  if (data === undefined || data === null) return '';
  if (typeof data !== 'object') return String(data);
  const d = data as Record<string, unknown>;
  if ('orders' in d && 'drivers' in d) {
    return `{orders: ${(d.orders as unknown[]).length}, drivers: ${(d.drivers as unknown[]).length}}`;
  }
  const json = JSON.stringify(data);
  return json.length > 140 ? json.slice(0, 137) + '...' : json;
}
