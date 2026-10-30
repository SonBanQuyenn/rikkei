// Kich ban demo: khach An dung 2 thiet bi, 2 nhan vien CSKH Lan va Minh.
import { startServer } from './app.js';
import { ChatClient } from './chat-client.js';

const PORT = 3457;
const t0 = Date.now();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const logger = (who: string) => (msg: string) =>
  console.log(`[+${((Date.now() - t0) / 1000).toFixed(2).padStart(5)}s] ${who.padEnd(10)} ${msg}`);
const step = (msg: string) => console.log(`\n=== ${msg} ===`);

const app = await startServer(PORT, false);
const url = `http://localhost:${PORT}`;
const phone = new ChatClient(url, 'tk-c01', 'customer', logger('An/phone'));
const laptop = new ChatClient(url, 'tk-c01', 'customer', logger('An/laptop'));
const lan = new ChatClient(url, 'tk-a01', 'agent', logger('CSKH Lan'));
const minh = new ChatClient(url, 'tk-a02', 'agent', logger('CSKH Minh'));
await Promise.all([phone, laptop, lan, minh].map((c) => c.connected()));

step('Khach mo khung chat tren dien thoai -> tao phien moi, vao hang cho');
const session = await phone.openChat();
logger('An/phone')(`phien ${session.id} (${session.status})`);
await sleep(200);

step('Khach mo tiep tren laptop -> noi lai dung phien cu');
const again = await laptop.openChat();
logger('An/laptop')(`phien ${again.id} - trung phien dien thoai: ${again.id === session.id}`);

step('Khach go phim roi gui tin khi chua co nhan vien');
phone.keystroke();
await sleep(200);
await phone.send('Chao shop, don DH-001 cua minh sao chua giao?');
await sleep(200);

step('Nhan vien Lan nhan phien -> thay lich su');
await lan.accept(session.id);
logger('CSKH Lan')(`lich su: ${JSON.stringify(lan.texts())}`);
await sleep(200);

step('Lan go phim, ngung 3s -> "dang soan tin" tu tat');
lan.keystroke();
await sleep(3300);

step('Lan tra loi -> hien tren ca dien thoai va laptop');
await lan.send('Chao anh, don dang o kho Thu Duc, chieu nay giao a.');
await sleep(300);

step('Bay du lieu: tin rong, chi khoang trang, tin 20.000 ky tu');
await laptop.send('');
await laptop.send('     ');
await laptop.send('x'.repeat(20_000));
await sleep(200);

step('Gui lai cung clientMsgId (mang chap chon) -> khong nhan doi');
await laptop.send('Cam on shop', 'dup-1');
await laptop.send('Cam on shop', 'dup-1');
await sleep(300);
logger('CSKH Lan')(`so tin nhan: ${lan.texts().length}`);
logger('An/phone')(`so tin nhan: ${phone.texts().length}`);

step('Lan roi phien -> khach duoc bao, phien ve hang cho, Minh nhan tiep');
await lan.leave();
await sleep(300);
await minh.accept(session.id);
await sleep(200);

step('Khach dong phien');
await phone.close();
await sleep(300);

[phone, laptop, lan, minh].forEach((c) => c.disconnect());
await app.close();
