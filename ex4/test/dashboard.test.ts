import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { INestApplication } from '@nestjs/common';
import { createApp } from '../src/app.js';
import { DEFAULT_CONFIG } from '../src/config.js';
import { MetricsService } from '../src/metrics.service.js';

interface SseEvent {
  id?: string;
  event: string;
  data: string;
  retry?: number;
  at: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (cond: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('timeout');
    await sleep(10);
  }
};

/** Mo mot ket noi SSE va phan tich luong thanh danh sach su kien. */
function openStream(url: string, headers: Record<string, string> = {}) {
  const controller = new AbortController();
  const events: SseEvent[] = [];
  const done = (async () => {
    const res = await fetch(url, { headers, signal: controller.signal });
    const decoder = new TextDecoder();
    let buf = '';
    try {
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        buf += decoder.decode(chunk, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const e: SseEvent = { event: 'message', data: '', at: Date.now() };
          for (const line of block.split('\n')) {
            const [k, ...rest] = line.split(': ');
            const v = rest.join(': ');
            if (k === 'id') e.id = v;
            else if (k === 'event') e.event = v;
            else if (k === 'data') e.data = v;
            else if (k === 'retry') e.retry = Number(v);
          }
          events.push(e);
        }
      }
    } catch {
      /* abort */
    }
  })();
  return { events, close: () => controller.abort(), done };
}

describe('Bang dieu khien van hanh (SSE)', () => {
  let app: INestApplication;
  let url: string;
  let metrics: MetricsService;

  before(async () => {
    app = await createApp({ simulate: false, heartbeatMs: 150, bufferSize: 5 }, false);
    await app.listen(0);
    url = `http://localhost:${app.getHttpServer().address().port}/dashboard/stream`;
    metrics = app.get(MetricsService);
  });
  after(() => app.close());

  test('cau hinh mac dinh: heartbeat < 60s idle timeout cua LB', () => {
    assert.ok(DEFAULT_CONFIG.heartbeatMs < 60_000 / 2);
  });

  test('ket noi moi nhan retry + snapshot day du', async () => {
    metrics.recordOrder(100_000);
    const s = openStream(url);
    await until(() => s.events.length >= 2);
    assert.equal(s.events[0].retry, 3000);
    assert.equal(s.events[1].event, 'snapshot');
    const snap = JSON.parse(s.events[1].data);
    assert.equal(snap.newOrders, 1);
    assert.equal(s.events[1].id, metrics.lastEventId);
    s.close();
  });

  test('canh bao het hang toi man hinh ngay lap tuc (<< 10s)', async () => {
    const s = openStream(url);
    await until(() => s.events.some((e) => e.event === 'snapshot'));
    const t0 = Date.now();
    metrics.raiseStockAlert('SKU-001', 'Tai nghe', 0);
    await until(() => s.events.some((e) => e.event === 'stock_alert'));
    const alert = s.events.find((e) => e.event === 'stock_alert')!;
    assert.ok(alert.at - t0 < 1000);
    assert.equal(JSON.parse(alert.data).sku, 'SKU-001');
    s.close();
  });

  test('ban dem khong co du lieu: heartbeat van chay deu, ket noi khong im lang', async () => {
    const s = openStream(url);
    await sleep(700);
    const beats = s.events.filter((e) => e.event === 'heartbeat');
    assert.ok(beats.length >= 3, `heartbeats=${beats.length}`);
    assert.ok(beats.every((e) => e.id === undefined)); // heartbeat khong lam lech Last-Event-ID
    s.close();
  });

  test('mang rot vai giay: noi lai voi Last-Event-ID nhan bu dung cac su kien da lo', async () => {
    const first = openStream(url);
    await until(() => first.events.some((e) => e.event === 'snapshot'));
    metrics.recordOrder(1);
    await until(() => first.events.some((e) => e.event === 'metrics'));
    const lastSeen = first.events.filter((e) => e.id).at(-1)!.id!;
    first.close(); // mat mang

    metrics.recordOrder(2);
    metrics.raiseStockAlert('SKU-002', 'Sac du phong', 1);

    const again = openStream(url, { 'Last-Event-ID': lastSeen });
    await until(() => again.events.filter((e) => e.id).length >= 2);
    const replay = again.events.filter((e) => e.id);
    assert.deepEqual(
      replay.map((e) => e.event),
      ['metrics', 'stock_alert'],
    );
    assert.equal(again.events.some((e) => e.event === 'snapshot'), false);
    again.close();
  });

  test('mat ket noi qua lau / id cua lan chay truoc: nhan lai snapshot thay vi du lieu thieu', async () => {
    const oldId = metrics.lastEventId;
    for (let i = 0; i < 10; i++) metrics.recordOrder(1); // vuot bufferSize=5
    const tooOld = openStream(url, { 'Last-Event-ID': oldId });
    const otherBoot = openStream(url, { 'Last-Event-ID': 'xyz.3' });
    await until(() => tooOld.events.length >= 2 && otherBoot.events.length >= 2);
    assert.equal(tooOld.events[1].event, 'snapshot');
    assert.equal(otherBoot.events[1].event, 'snapshot');
    tooOld.close();
    otherBoot.close();
  });

  test('man hinh ngat ket noi thi server don sach listener', async () => {
    const streams = [openStream(url), openStream(url), openStream(url)];
    await until(() => metrics.subscriberCount === 3);
    streams.forEach((s) => s.close());
    await until(() => metrics.subscriberCount === 0);
  });
});
