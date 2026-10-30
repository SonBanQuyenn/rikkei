// Chay thu: ket noi -> ngat mang giua chung -> bat lai; sau do mo phong mang chap chon
// 10 lan trong 30 giay. Toan bo log duoc ghi ra logs/reconnect-run.log.
import { mkdirSync, writeFileSync } from 'node:fs';
import type { INestApplication, LoggerService } from '@nestjs/common';
import { createDriverClient, describeStatus } from './driver-client.js';
import { DriverGateway } from './server/driver.gateway.js';
import { startServer } from './server/app.js';

const PORT = 3456;
const t0 = Date.now();
const lines: string[] = [];
const log = (who: string, msg: string) => {
  const line = `[+${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s] ${who.padEnd(6)} ${msg}`;
  lines.push(line);
  console.log(line);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const serverLogger: LoggerService = {
  log: (m, ctx) => ctx === 'DriverGateway' && log('SERVER', String(m)),
  error: (m) => log('SERVER', `ERROR ${m}`),
  warn: () => {},
};

let app: INestApplication | undefined;
let totalHandshakes = 0;
async function up() {
  app = await startServer(PORT, serverLogger);
  log('NET', '=== server/mang hoat dong ===');
}
async function down() {
  totalHandshakes += app!.get(DriverGateway).handshakes;
  await app!.close();
  app = undefined;
  log('NET', '=== MAT KET NOI (tat server / mat song) ===');
}

let attempts = 0;
await up();
const socket = createDriverClient({
  url: `http://localhost:${PORT}`,
  token: 'token-tx01',
  zones: ['Q1', 'Q3'],
  onStatus: (s) => {
    if (s.state === 'reconnecting') attempts++;
    log('APP', describeStatus(s));
  },
  onNewOrder: (o) => log('APP', `>>> NHAN DON MOI ${o.orderId} (khu vuc ${o.zone})`),
});

// --- Phan 1: ngat mang giua chung roi bat lai ---
await sleep(1500);
app!.get(DriverGateway).dispatchToZone('Q1', 'DH-1001');
await sleep(1000);
await down();
await sleep(8000); // tai xe di qua ham 8 giay
await up();
await new Promise<void>((r) => (socket.connected ? r() : socket.once('connect', () => r())));
await sleep(500);
app!.get(DriverGateway).dispatchToZone('Q3', 'DH-1002');
await sleep(1000);

// --- Phan 2: mang chap chon bat/tat 10 lan trong 30 giay ---
log('NET', '=== BAT DAU MO PHONG MANG CHAP CHON: 10 lan trong 30s ===');
attempts = 0;
for (let i = 1; i <= 10; i++) {
  await down();
  await sleep(1500);
  await up();
  await sleep(1500);
}
await new Promise<void>((r) => (socket.connected ? r() : socket.once('connect', () => r())));
await sleep(500);
totalHandshakes += app!.get(DriverGateway).handshakes;
log('NET', `Pha chap chon: app thu ket noi lai tong cong ${attempts} lan trong ~30s`);
log('NET', `Server chi nhan ${totalHandshakes} lan bat tay ca buoi chay (khong co bao request)`);
app!.get(DriverGateway).dispatchToZone('Q1', 'DH-1003');
await sleep(1000);

socket.close();
await app!.close();
mkdirSync('logs', { recursive: true });
writeFileSync('logs/reconnect-run.log', lines.join('\n') + '\n');
console.log('\nDa ghi log vao logs/reconnect-run.log');
