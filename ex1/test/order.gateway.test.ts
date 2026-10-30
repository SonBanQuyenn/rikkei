import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { INestApplication } from '@nestjs/common';
import { io, type Socket } from 'socket.io-client';
import { createApp } from '../src/app.js';
import { OrderGateway, orderRoom } from '../src/order.gateway.js';
import { BuggyOrderGateway } from '../src/order.gateway.buggy.js';

type Updated = { orderId: string; status: string };

async function start(gateway: typeof OrderGateway | typeof BuggyOrderGateway) {
  const app = await createApp(gateway, false);
  await app.listen(0);
  const { port } = app.getHttpServer().address();
  return { app, url: `http://localhost:${port}` };
}

/** Mo mot "tab" trinh duyet va ghi lai moi su kien order:updated nhan duoc. */
async function openTab(url: string) {
  const socket = io(url, { transports: ['websocket'], forceNew: true });
  const received: Updated[] = [];
  socket.on('order:updated', (p: Updated) => received.push(p));
  await new Promise<void>((resolve) => socket.once('connect', () => resolve()));
  return { socket, received };
}

const track = (s: Socket, orderId: string) => s.emitWithAck('order:track', orderId);
const settle = () => new Promise((r) => setTimeout(r, 150));
const waitDisconnect = () => new Promise((r) => setTimeout(r, 200));

describe('Ban LOI - chung minh khiem khuyet', () => {
  let app: INestApplication;
  let url: string;
  before(async () => ({ app, url } = await start(BuggyOrderGateway)));
  after(() => app.close());

  test('K1: tab cua khach B nhan thong bao don cua khach A', async () => {
    const tabA = await openTab(url); // khach An theo doi DH-001
    const tabB = await openTab(url); // khach Binh theo doi DH-002
    await track(tabA.socket, 'DH-001');
    await track(tabB.socket, 'DH-002');

    app.get(BuggyOrderGateway).notifyStatusChanged('DH-001', 'SHIPPING');
    await settle();

    assert.deepEqual(tabA.received, [{ orderId: 'DH-001', status: 'SHIPPING' }]);
    // Ket qua dung phai la [] - thuc te tab B nhan duoc du lieu cua khach A
    assert.deepEqual(tabB.received, [{ orderId: 'DH-001', status: 'SHIPPING' }]);
    tabA.socket.close();
    tabB.socket.close();
  });

  test('K2: Map tracked giu lai ban ghi sau khi client roi di', async () => {
    const gw = app.get(BuggyOrderGateway);
    gw.tracked.clear();
    const tabs = await Promise.all(Array.from({ length: 50 }, () => openTab(url)));
    await Promise.all(tabs.map((t, i) => track(t.socket, `DH-${i}`)));
    tabs.forEach((t) => t.socket.close());
    await waitDisconnect();

    // Ket qua dung phai la 0 - thuc te con nguyen 50 ban ghi, tang mai theo thoi gian
    assert.equal(gw.tracked.size, 50);
  });

  test('K3: theo doi don thu 2 ghi de don thu nhat trong Map', async () => {
    const gw = app.get(BuggyOrderGateway);
    const tab = await openTab(url);
    await track(tab.socket, 'DH-001');
    await track(tab.socket, 'DH-002');
    // Ket qua dung: tab theo doi ca 2 don - thuc te chi con DH-002
    assert.equal(gw.tracked.get(tab.socket.id!), 'DH-002');
    tab.socket.close();
  });

  test('K4: tab khong theo doi don nao van nhan moi thong bao', async () => {
    const idle = await openTab(url);
    const gw = app.get(BuggyOrderGateway);
    for (let i = 0; i < 20; i++) gw.notifyStatusChanged(`DH-${i}`, 'PACKED');
    await settle();
    // Ket qua dung la 0 - thuc te tab "rong" van phai xu ly 20 su kien => tab cang mo lau cang cham
    assert.equal(idle.received.length, 20);
    idle.socket.close();
  });
});

describe('Ban DA SUA', () => {
  let app: INestApplication;
  let url: string;
  before(async () => ({ app, url } = await start(OrderGateway)));
  after(() => app.close());

  test('K1: chi tab theo doi dung don moi nhan thong bao', async () => {
    const tabA = await openTab(url);
    const tabB = await openTab(url);
    await track(tabA.socket, 'DH-001');
    await track(tabB.socket, 'DH-002');

    app.get(OrderGateway).notifyStatusChanged('DH-001', 'SHIPPING');
    await settle();

    assert.deepEqual(tabA.received, [{ orderId: 'DH-001', status: 'SHIPPING' }]);
    assert.deepEqual(tabB.received, []);
    tabA.socket.close();
    tabB.socket.close();
  });

  test('K2: khong con trang thai nao sau khi client roi di', async () => {
    const server = app.get(OrderGateway).server;
    const tabs = await Promise.all(Array.from({ length: 50 }, () => openTab(url)));
    await Promise.all(tabs.map((t, i) => track(t.socket, `DH-${i}`)));
    assert.equal(server.sockets.adapter.rooms.has(orderRoom('DH-0')), true);

    tabs.forEach((t) => t.socket.close());
    await waitDisconnect();

    for (let i = 0; i < 50; i++) {
      assert.equal(server.sockets.adapter.rooms.has(orderRoom(`DH-${i}`)), false);
    }
    assert.equal(server.sockets.sockets.size, 0);
  });

  test('K3: mot tab theo doi nhieu don, nhan du ca hai', async () => {
    const tab = await openTab(url);
    await track(tab.socket, 'DH-001');
    await track(tab.socket, 'DH-002');
    const gw = app.get(OrderGateway);
    gw.notifyStatusChanged('DH-001', 'SHIPPING');
    gw.notifyStatusChanged('DH-002', 'DELIVERED');
    await settle();
    assert.equal(tab.received.length, 2);
    tab.socket.close();
  });

  test('K4: tab khong theo doi don nao khong nhan gi', async () => {
    const idle = await openTab(url);
    const gw = app.get(OrderGateway);
    for (let i = 0; i < 20; i++) gw.notifyStatusChanged(`DH-${i}`, 'PACKED');
    await settle();
    assert.equal(idle.received.length, 0);
    idle.socket.close();
  });

  test('untrack: bo theo doi thi khong nhan nua; orderId sai bi tu choi', async () => {
    const tab = await openTab(url);
    await track(tab.socket, 'DH-009');
    await tab.socket.emitWithAck('order:untrack', 'DH-009');
    app.get(OrderGateway).notifyStatusChanged('DH-009', 'SHIPPING');
    await settle();
    assert.equal(tab.received.length, 0);
    assert.equal((await track(tab.socket, '  ')).ok, false);
    tab.socket.close();
  });
});
