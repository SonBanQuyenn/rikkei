import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { createDriverClient, type ConnectionStatus } from '../src/driver-client.js';
import { startServer } from '../src/server/app.js';
import { DriverGateway } from '../src/server/driver.gateway.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const freePort = () =>
  new Promise<number>((resolve) => {
    const s = createServer().listen(0, () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
  });
const until = async (cond: () => boolean, ms = 5000) => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('timeout');
    await sleep(20);
  }
};

describe('Co che ket noi lai cua app tai xe', () => {
  test('noi lai tu dong sau khi mat ket noi va dang ky lai room', async () => {
    const port = await freePort();
    let app = await startServer(port, false);
    const orders: string[] = [];
    const statuses: ConnectionStatus['state'][] = [];
    const socket = createDriverClient({
      url: `http://localhost:${port}`,
      token: 'token-tx01',
      zones: ['Q1'],
      retry: { delay: 100, delayMax: 400, randomizationFactor: 0 },
      onStatus: (s) => statuses.push(s.state),
      onNewOrder: (o) => orders.push(o.orderId),
    });
    await until(() => app.get(DriverGateway).online.has('TX01'));
    await sleep(100);

    await app.close(); // mat ket noi
    await until(() => statuses.includes('offline'));
    await sleep(500);
    app = await startServer(port, false);
    await until(() => socket.connected);
    await sleep(100);

    app.get(DriverGateway).dispatchToZone('Q1', 'DH-1');
    await until(() => orders.length === 1);
    assert.deepEqual(orders, ['DH-1']); // van nhan don vi da join lai room Q1
    assert.ok(statuses.includes('reconnecting'));
    assert.equal(statuses.at(-1), 'online');
    socket.close();
    await app.close();
  });

  test('thoi gian cho gian dan, co gioi han so lan, het dot thi nghi roi tu thu lai', async () => {
    const port = await freePort(); // khong co server nao o cong nay
    const at: number[] = [];
    const states: ConnectionStatus[] = [];
    const socket = createDriverClient({
      url: `http://localhost:${port}`,
      token: 'token-tx01',
      zones: [],
      retry: { delay: 100, delayMax: 800, randomizationFactor: 0, attempts: 5, cooldown: 300 },
      onStatus: (s) => {
        states.push(s);
        if (s.state === 'reconnecting') at.push(Date.now());
      },
    });
    await until(() => states.some((s) => s.state === 'waiting'), 6000);

    assert.equal(at.length, 5); // dung gioi han, khong thu vo han
    const gaps = at.slice(1).map((t, i) => t - at[i]);
    // 200, 400, 800, 800 (cham tran delayMax) - moi khoang >= khoang truoc
    for (let i = 1; i < gaps.length; i++) assert.ok(gaps[i] >= gaps[i - 1] * 0.8, `gaps ${gaps}`);
    assert.ok(gaps.at(-1)! >= 600);

    // Sau cooldown, tu bat dot thu moi ma tai xe khong can thao tac
    await until(() => at.length > 5, 3000);
    socket.close();
  });

  test('mang chap chon 10 lan: so lan bat tay bi chan tren, khong thanh bao', async () => {
    const port = await freePort();
    let app = await startServer(port, false);
    let handshakes = 0;
    const clients = Array.from({ length: 20 }, () =>
      createDriverClient({
        url: `http://localhost:${port}`,
        token: 'token-tx02',
        zones: ['Q7'],
        retry: { delay: 100, delayMax: 2000, randomizationFactor: 0.5 },
      }),
    );
    await until(() => clients.every((c) => c.connected));
    for (let i = 0; i < 10; i++) {
      handshakes += app.get(DriverGateway).handshakes;
      await app.close();
      await sleep(150);
      app = await startServer(port, false);
      await sleep(150);
    }
    await until(() => clients.every((c) => c.connected), 10_000);
    handshakes += app.get(DriverGateway).handshakes;

    // 20 thiet bi x (1 lan dau + 10 lan noi lai) = 220 neu moi lan chap chon chi
    // can 1 lan bat tay; backoff + jitter giu so lan quanh muc do, khong nhan len.
    assert.ok(handshakes <= 20 * 11 * 1.5, `handshakes=${handshakes}`);
    clients.forEach((c) => c.close());
    await app.close();
  });

  test('server danh dau offline khi tai xe ngat ket noi; sai token thi khong thu lai', async () => {
    const port = await freePort();
    const app = await startServer(port, false);
    const gw = app.get(DriverGateway);
    const ok = createDriverClient({ url: `http://localhost:${port}`, token: 'token-tx01', zones: [] });
    await until(() => gw.online.has('TX01'));
    ok.close();
    await until(() => !gw.online.has('TX01'));

    const states: ConnectionStatus[] = [];
    const bad = createDriverClient({
      url: `http://localhost:${port}`,
      token: 'sai',
      zones: [],
      retry: { delay: 50 },
      onStatus: (s) => states.push(s),
    });
    await until(() => states.length > 0);
    await sleep(500);
    assert.equal(gw.handshakes, 2); // 1 hop le + 1 sai, khong thu lai
    assert.deepEqual(states, [{ state: 'offline', reason: 'UNAUTHORIZED' }]);
    bad.close();
    await app.close();
  });
});
