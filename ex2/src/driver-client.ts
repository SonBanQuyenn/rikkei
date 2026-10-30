// driver-client.ts
import { io, type Socket } from 'socket.io-client';

export type ConnectionStatus =
  | { state: 'online' }
  | { state: 'offline'; reason: string }
  | { state: 'reconnecting'; attempt: number }
  | { state: 'waiting'; retryInMs: number };

export interface DriverClientOptions {
  url: string;
  token: string;
  zones: string[];
  onStatus?: (status: ConnectionStatus) => void;
  onNewOrder?: (order: { orderId: string; zone: string }) => void;
  /** Cho phep test thu nho thoi gian; mac dinh la gia tri production ben duoi. */
  retry?: Partial<RetryConfig>;
}

export interface RetryConfig {
  delay: number;
  delayMax: number;
  randomizationFactor: number;
  attempts: number;
  cooldown: number;
}

export const DEFAULT_RETRY: RetryConfig = {
  delay: 1_000, // lan thu dau sau ~1s
  delayMax: 10_000, // cho toi da 10s giua 2 lan (ra khoi ham la noi lai nhanh)
  randomizationFactor: 0.5, // +-50% de hang nghin tai xe khong cung luc noi lai
  attempts: 10, // 1+2+4+8+10*6 ~ 75s cho moi dot
  cooldown: 60_000, // het dot thi nghi 60s roi tu bat dot moi
};

export function createDriverClient(opts: DriverClientOptions): Socket {
  const retry = { ...DEFAULT_RETRY, ...opts.retry };
  const status = opts.onStatus ?? (() => {});

  const socket = io(opts.url, {
    auth: { token: opts.token },
    transports: ['websocket'],
    // (1) bat tu dong ket noi lai
    reconnection: true,
    // (2) gioi han so lan thu + gian dan thoi gian cho (exponential backoff + jitter):
    //     delay_n = min(delay * 2^n, delayMax) * (1 +- randomizationFactor)
    reconnectionAttempts: retry.attempts,
    reconnectionDelay: retry.delay,
    reconnectionDelayMax: retry.delayMax,
    randomizationFactor: retry.randomizationFactor,
  });

  socket.on('connect', () => {
    console.log('da ket noi');
    status({ state: 'online' });
    // (3) dang ky lai cac room sau khi noi lai: moi lan noi lai la mot socket moi
    //     tren server, room cu da bi xoa khi disconnect -> phai join lai.
    socket.emit('driver:join_zones', opts.zones);
  });

  socket.on('order:new', (order) => opts.onNewOrder?.(order));

  // (4) xu ly su kien mat ket noi de bao cho tai xe biet
  socket.on('disconnect', (reason) => {
    status({ state: 'offline', reason });
    // Server chu dong ngat (vd. token bi thu hoi) thi socket.io KHONG tu noi lai:
    // khong noi lai de tranh vong lap bi tu choi.
  });
  socket.io.on('reconnect_attempt', (attempt) => status({ state: 'reconnecting', attempt }));
  socket.io.on('reconnect_failed', () => {
    // Het mot dot thu: khong bo cuoc (tai xe khong phai thao tac), nhung nghi dai
    // truoc khi bat dau dot moi de khong tao bao request khi mang chap chon.
    status({ state: 'waiting', retryInMs: retry.cooldown });
    setTimeout(() => socket.connect(), retry.cooldown).unref?.();
  });
  socket.on('connect_error', (err) => {
    if (err.message === 'UNAUTHORIZED') {
      socket.io.reconnection(false); // sai token: thu lai cung vo ich
      status({ state: 'offline', reason: 'UNAUTHORIZED' });
    }
  });

  return socket;
}

/** Thong diep hien thi tren app tai xe. */
export function describeStatus(s: ConnectionStatus): string {
  switch (s.state) {
    case 'online':
      return 'Dang truc tuyen - san sang nhan don';
    case 'offline':
      if (s.reason === 'UNAUTHORIZED') return 'Phien dang nhap het han, vui long dang nhap lai';
      if (s.reason === 'io client disconnect') return 'Da dang xuat';
      return `Mat ket noi (${s.reason}) - dang tu ket noi lai...`;
    case 'reconnecting':
      return `Dang ket noi lai (lan ${s.attempt})...`;
    case 'waiting':
      return `Chua ket noi duoc, tu thu lai sau ${Math.round(s.retryInMs / 1000)}s`;
  }
}
