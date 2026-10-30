// Kich ban demo: 3 vai tro hoat dong dong thoi - 1 dieu phoi vien, 2 tai xe, 2 khach hang.
// Nguong thoi gian duoc thu nho (giay thay vi phut) de xem duoc tinh huong "don tac".
import { mkdirSync, writeFileSync } from 'node:fs';
import { AuthService } from './auth/auth.service.js';
import { startServer } from './app.module.js';
import { RoleClient } from './client.js';
import { C2S, S2C } from './contracts/events.js';

const PORT = 3458;
const t0 = Date.now();
const lines: string[] = [];
const log = (who: string, msg: string) => {
  const line = `[+${((Date.now() - t0) / 1000).toFixed(2).padStart(6)}s] ${who.padEnd(10)} ${msg}`;
  lines.push(line);
  console.log(line);
};
const step = (msg: string) => {
  lines.push('', `=== ${msg} ===`);
  console.log(`\n=== ${msg} ===`);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const app = await startServer(
  PORT,
  { pendingLimitMs: 2000, offerTimeoutMs: 3000, silentLimitMs: 4000, monitorIntervalMs: 250 },
  false,
);
const auth = app.get(AuthService);
const url = `http://localhost:${PORT}`;
const connect = async (id: string, label: string) => {
  const c = new RoleClient(url, auth.issue(id), label, log);
  await c.connected();
  return c;
};

step('0. Ket noi khong hop le bi chan ngay khi bat tay');
for (const [label, token] of [['khong token', undefined], ['token gia', 'abc.def']] as const) {
  const bad = new RoleClient(url, token as string, label, log);
  await bad.connected().catch((e) => log(label, `bi tu choi: ${e.message}`));
  bad.disconnect();
}

step('1. Ca 3 nhom nguoi dung ket noi dong thoi');
const [ops, cuong, dung, an, binh] = await Promise.all([
  connect('OP01', 'DieuPhoi'),
  connect('D01', 'TX Cuong'),
  connect('D02', 'TX Dung'),
  connect('C01', 'Khach An'),
  connect('C02', 'Khach Binh'),
]);
await cuong.call(C2S.DRIVER_SET_STATUS, { status: 'available' });
await dung.call(C2S.DRIVER_SET_STATUS, { status: 'available' });
await cuong.call(C2S.DRIVER_LOCATION, { lat: 10.776, lng: 106.7 });

step('2. Khach dat don');
const o1 = (await an.call(C2S.CUSTOMER_PLACE_ORDER, { pickup: 'Kho Thu Duc', dropoff: '12 Le Loi, Q1' })) as any;
const o2 = (await binh.call(C2S.CUSTOMER_PLACE_ORDER, { pickup: 'Kho Thu Duc', dropoff: '5 Nguyen Hue, Q1' })) as any;
const id1: string = o1.data.orderId;
const id2: string = o2.data.orderId;
await sleep(200);

step('3. Dieu phoi vien gan don; tai xe Dung tu choi');
await ops.call(C2S.DISPATCH_ASSIGN, { orderId: id1, driverId: 'D01' });
await ops.call(C2S.DISPATCH_ASSIGN, { orderId: id2, driverId: 'D02' });
await sleep(100);
await cuong.call(C2S.DRIVER_RESPOND, { orderId: id1, accept: true });
await dung.call(C2S.DRIVER_RESPOND, { orderId: id2, accept: false });

step('4. Don bi tac: cho gan qua nguong -> canh bao ORDER_STUCK');
await sleep(2600);

step('5. Can thiep: gan don cho tai xe dang ban bi tu choi, gan lai cho Dung');
await ops.call(C2S.DISPATCH_ASSIGN, { orderId: id2, driverId: 'D01' });
await ops.call(C2S.DISPATCH_ASSIGN, { orderId: id2, driverId: 'D02' });
await cuong.call(C2S.DRIVER_LOCATION, { lat: 10.85, lng: 106.77 }); // Cuong dang toi kho
step('6. Dung khong phan hoi -> het han de nghi, don tu ve hang cho (OFFER_TIMEOUT)');
await sleep(3500);
await ops.call(C2S.DISPATCH_ASSIGN, { orderId: id2, driverId: 'D02' });
await dung.call(C2S.DRIVER_RESPOND, { orderId: id2, accept: true });

step('7. Cuong lay hang va di giao: chi Khach An thay vi tri');
await cuong.call(C2S.DRIVER_PROGRESS, { orderId: id1, status: 'picked_up' });
await cuong.call(C2S.DRIVER_LOCATION, { lat: 10.774, lng: 106.701 });
await sleep(100);

step('8. Cuong im lang qua lau -> DRIVER_SILENT; roi mat ket noi -> DRIVER_DISCONNECTED');
await sleep(4500);
cuong.disconnect();
await sleep(300);

step('9. Cuong noi lai (thiet bi moi) -> nhan lai nhiem vu dang lam, giao xong');
const cuong2 = await connect('D01', 'TX Cuong');
await sleep(100);
await cuong2.call(C2S.DRIVER_PROGRESS, { orderId: id1, status: 'delivered' });
await sleep(100);

step('10. Du lieu loi / sai quyen: tra loi than thien, server khong crash');
await an.call(C2S.DISPATCH_ASSIGN, { orderId: id2, driverId: 'D01' });
await an.call(C2S.CUSTOMER_PLACE_ORDER, { pickup: '   ', dropoff: 'x' });
await an.call(C2S.CUSTOMER_PLACE_ORDER, null);
await dung.call(C2S.DRIVER_LOCATION, { lat: 'abc' });
await dung.call(C2S.DRIVER_PROGRESS, { orderId: id1, status: 'delivered' });
await ops.call(C2S.DISPATCH_ASSIGN, { orderId: 'DH-9999', driverId: 'D01' });

step('11. Kiem tra pham vi du lieu');
const leaked = binh.of(S2C.CUSTOMER_ORDER).filter((o) => o.orderId !== id2).length;
log('KIEM TRA', `Khach Binh nhan ${binh.of(S2C.CUSTOMER_ORDER).length} cap nhat, ${leaked} cap nhat cua don nguoi khac`);
log('KIEM TRA', `Khach Binh nhan ${binh.of(S2C.CUSTOMER_DRIVER_LOCATION).length} vi tri tai xe (don cua Binh chua lay hang)`);
log('KIEM TRA', `Tai xe Dung nhan nhiem vu: ${[...new Set(dung.of(S2C.DRIVER_TASK).map((t) => t.orderId))].join(', ')}`);
log('KIEM TRA', `Dieu phoi vien nhan ${ops.of(S2C.DISPATCH_ALERT).length} canh bao: ${ops.of(S2C.DISPATCH_ALERT).map((a) => a.type).join(', ')}`);

[ops, cuong2, dung, an, binh].forEach((c) => c.disconnect());
await app.close();
mkdirSync('logs', { recursive: true });
writeFileSync('logs/demo-run.log', lines.join('\n') + '\n');
console.log('\nDa ghi log vao logs/demo-run.log');
