import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { INestApplication } from '@nestjs/common';
import { startServer } from '../src/app.module.js';
import { AuthService } from '../src/auth/auth.service.js';
import { RoleClient } from '../src/client.js';
import { C2S, S2C } from '../src/contracts/events.js';
import { DomainEvents } from '../src/domain/domain-events.js';
import { DriverService } from '../src/domain/driver.service.js';
import { DispatchGateway } from '../src/gateway/dispatch.gateway.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (cond: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('timeout');
    await sleep(10);
  }
};

describe('Trung tam dieu phoi giao hang', () => {
  let app: INestApplication;
  let url: string;
  let auth: AuthService;
  const clients: RoleClient[] = [];
  const connect = async (userId: string) => {
    const c = new RoleClient(url, auth.issue(userId), userId);
    clients.push(c);
    await c.connected();
    return c;
  };
  const placeOrder = async (c: RoleClient) =>
    (await c.call(C2S.CUSTOMER_PLACE_ORDER, { pickup: 'Kho A', dropoff: 'Nha B' })) as { ok: true; data: { orderId: string } };

  before(async () => {
    app = await startServer(0, { pendingLimitMs: 300, offerTimeoutMs: 400, silentLimitMs: 400, monitorIntervalMs: 50 }, false);
    url = `http://localhost:${app.getHttpServer().address().port}`;
    auth = app.get(AuthService);
  });
  after(async () => {
    clients.forEach((c) => c.disconnect());
    await app.close();
  });

  describe('Xac thuc tai thoi diem bat tay', () => {
    for (const [name, token] of [
      ['khong co token', undefined],
      ['token gia mao', 'eyJ.abc'],
      ['token het han', 'EXPIRED'],
      ['token sua vai tro', 'TAMPERED'],
    ] as const) {
      test(`tu choi ${name}`, async () => {
        let t: string | undefined = token;
        if (token === 'EXPIRED') t = auth.issue('C01', -1000);
        if (token === 'TAMPERED') {
          const [, sig] = auth.issue('C01').split('.');
          const body = Buffer.from(JSON.stringify({ sub: 'C01', role: 'dispatcher', exp: Date.now() + 1e6 })).toString('base64url');
          t = `${body}.${sig}`;
        }
        const c = new RoleClient(url, t as string, 'x');
        clients.push(c);
        await assert.rejects(c.connected(), /UNAUTHORIZED/);
      });
    }
  });

  test('moi nhom chi nhan du lieu thuoc pham vi cua minh', async () => {
    const [ops, d1, d2, c1, c2] = await Promise.all(['OP01', 'D01', 'D02', 'C01', 'C02'].map(connect));
    await d1.call(C2S.DRIVER_SET_STATUS, { status: 'available' });
    await d2.call(C2S.DRIVER_SET_STATUS, { status: 'available' });
    const { data } = await placeOrder(c1);
    await ops.call(C2S.DISPATCH_ASSIGN, { orderId: data.orderId, driverId: 'D01' });
    await d1.call(C2S.DRIVER_RESPOND, { orderId: data.orderId, accept: true });
    await d1.call(C2S.DRIVER_LOCATION, { lat: 10.7, lng: 106.6 });
    await until(() => c1.of(S2C.CUSTOMER_DRIVER_LOCATION).length === 1);
    await sleep(100);

    // Khach C02 va tai xe D02 khong nhan bat ky gi ve don cua C01
    assert.equal(c2.received.length, 0);
    assert.equal(d2.of(S2C.DRIVER_TASK).length, 0);
    // Khach chi thay ban rut gon: khong co id/ten khach hang khac, dia chi noi bo...
    const view = c1.of(S2C.CUSTOMER_ORDER).at(-1);
    assert.deepEqual(Object.keys(view).sort(), ['driverName', 'orderId', 'status', 'updatedAt']);
    assert.equal(view.driverName, 'Tai xe Cuong');
    // Khach/tai xe khong bao gio nhan su kien danh cho dieu phoi
    for (const c of [c1, c2, d1, d2]) assert.equal(c.received.some((r) => r.event.startsWith('dispatch:')), false);
    // Dieu phoi vien thay toan canh
    assert.equal(ops.of(S2C.DISPATCH_SNAPSHOT).length, 1);
    assert.ok(ops.of(S2C.DISPATCH_ORDER).some((o) => o.id === data.orderId && o.customerId === 'C01'));

    await d1.call(C2S.DRIVER_PROGRESS, { orderId: data.orderId, status: 'picked_up' });
    await d1.call(C2S.DRIVER_PROGRESS, { orderId: data.orderId, status: 'delivered' });
    await until(() => c1.of(S2C.CUSTOMER_ORDER).at(-1).status === 'delivered');
    [ops, d1, d2, c1, c2].forEach((c) => c.disconnect());
  });

  test('vai tro khong duoc gui su kien cua vai tro khac', async () => {
    const c1 = await connect('C01');
    const d1 = await connect('D01');
    const res1 = await c1.call(C2S.DISPATCH_ASSIGN, { orderId: 'DH-0001', driverId: 'D01' });
    const res2 = await d1.call(C2S.CUSTOMER_PLACE_ORDER, { pickup: 'a', dropoff: 'b' });
    assert.deepEqual(res1, { ok: false, error: 'Ban khong co quyen thuc hien thao tac nay' });
    assert.equal(res2.ok, false);
    c1.disconnect();
    d1.disconnect();
  });

  test('tai xe tu choi, de nghi het han, don cho qua lau -> dieu phoi vien nhan canh bao', async () => {
    const ops = await connect('OP01');
    const d2 = await connect('D02');
    const c2 = await connect('C02');
    await d2.call(C2S.DRIVER_SET_STATUS, { status: 'available' });
    const { data } = await placeOrder(c2);

    await ops.call(C2S.DISPATCH_ASSIGN, { orderId: data.orderId, driverId: 'D02' });
    await d2.call(C2S.DRIVER_RESPOND, { orderId: data.orderId, accept: false });
    await until(() => ops.of(S2C.DISPATCH_ALERT).some((a) => a.type === 'DRIVER_REJECTED'));
    assert.equal(d2.of(S2C.DRIVER_TASK_REVOKED).length, 1);

    await until(() => ops.of(S2C.DISPATCH_ALERT).some((a) => a.type === 'ORDER_STUCK' && a.orderId === data.orderId));

    await ops.call(C2S.DISPATCH_ASSIGN, { orderId: data.orderId, driverId: 'D02' });
    await until(() => ops.of(S2C.DISPATCH_ALERT).some((a) => a.type === 'OFFER_TIMEOUT'));
    assert.equal(c2.of(S2C.CUSTOMER_ORDER).at(-1).status, 'pending');
    [ops, d2, c2].forEach((c) => c.disconnect());
  });

  test('gan lai don: tai xe cu bi thu hoi, tai xe moi nhan nhiem vu', async () => {
    const ops = await connect('OP01');
    const [d1, d2, c1] = await Promise.all(['D01', 'D02', 'C01'].map(connect));
    await d1.call(C2S.DRIVER_SET_STATUS, { status: 'available' });
    await d2.call(C2S.DRIVER_SET_STATUS, { status: 'available' });
    const { data } = await placeOrder(c1);
    await ops.call(C2S.DISPATCH_ASSIGN, { orderId: data.orderId, driverId: 'D01' });
    const res = await ops.call(C2S.DISPATCH_ASSIGN, { orderId: data.orderId, driverId: 'D02' });
    assert.equal(res.ok, true);
    await until(() => d1.of(S2C.DRIVER_TASK_REVOKED).length === 1 && d2.of(S2C.DRIVER_TASK).length === 1);
    assert.equal((await d1.call(C2S.DRIVER_RESPOND, { orderId: data.orderId, accept: true })).ok, false);
    assert.equal((await d2.call(C2S.DRIVER_RESPOND, { orderId: data.orderId, accept: true })).ok, true);
    [ops, d1, d2, c1].forEach((c) => c.disconnect());
  });

  test('tai xe mat ket noi bat ngo: canh bao, offline; noi lai thi nhan lai nhiem vu', async () => {
    const ops = await connect('OP01');
    const d1 = await connect('D01');
    const c1 = await connect('C01');
    await d1.call(C2S.DRIVER_SET_STATUS, { status: 'available' });
    const { data } = await placeOrder(c1);
    await ops.call(C2S.DISPATCH_ASSIGN, { orderId: data.orderId, driverId: 'D01' });
    await d1.call(C2S.DRIVER_RESPOND, { orderId: data.orderId, accept: true });

    d1.disconnect();
    await until(() => ops.of(S2C.DISPATCH_ALERT).some((a) => a.type === 'DRIVER_DISCONNECTED'));
    assert.ok(ops.of(S2C.DISPATCH_DRIVER).some((d) => d.id === 'D01' && d.availability === 'offline'));

    const again = await connect('D01');
    await until(() => again.of(S2C.DRIVER_TASK).some((t) => t.orderId === data.orderId));
    await again.call(C2S.DRIVER_PROGRESS, { orderId: data.orderId, status: 'picked_up' });
    await again.call(C2S.DRIVER_PROGRESS, { orderId: data.orderId, status: 'delivered' });
    [ops, again, c1].forEach((c) => c.disconnect());
  });

  test('du lieu rac khong lam server crash, moi loi deu co thong bao', async () => {
    const d1 = await connect('D01');
    const c1 = await connect('C01');
    const ops = await connect('OP01');
    const payloads = [null, undefined, 42, 'abc', [], { lat: 'x' }, { orderId: {} }, { pickup: 'a'.repeat(500), dropoff: 'b' }];
    for (const p of payloads) {
      for (const [client, event] of [
        [c1, C2S.CUSTOMER_PLACE_ORDER],
        [d1, C2S.DRIVER_LOCATION],
        [d1, C2S.DRIVER_RESPOND],
        [d1, C2S.DRIVER_PROGRESS],
        [d1, C2S.DRIVER_SET_STATUS],
        [ops, C2S.DISPATCH_ASSIGN],
      ] as const) {
        const res = await client.call(event, p);
        assert.equal(res.ok, false);
        assert.equal(typeof (res as { error: string }).error, 'string');
      }
    }
    // Su kien khong co trong hop dong: bi bo qua, ket noi van song
    d1.socket.emit('hack:drop_db', {});
    await sleep(50);
    assert.equal(d1.socket.connected, true);
    [d1, c1, ops].forEach((c) => c.disconnect());
  });

  test('khong ro ri tai nguyen sau nhieu lan ket noi / ngat', async () => {
    const gw = app.get(DispatchGateway);
    const events = app.get(DomainEvents);
    const listenersBefore = events.eventNames().reduce((n, e) => n + events.listenerCount(e), 0);
    await sleep(200);
    for (let round = 0; round < 5; round++) {
      const batch = await Promise.all(['OP01', 'D01', 'D02', 'C01', 'C02'].map(connect));
      batch.forEach((c) => c.disconnect());
    }
    await until(() => gw.server.sockets.sockets.size === 0);
    await until(() => app.get(DriverService).list().every((d) => d.connections === 0));
    const listenersAfter = events.eventNames().reduce((n, e) => n + events.listenerCount(e), 0);
    assert.equal(listenersAfter, listenersBefore);
    // Chi con room cua socket dang mo (khong co) -> khong con room nao
    assert.equal(gw.server.sockets.adapter.rooms.size, 0);
  });
});
