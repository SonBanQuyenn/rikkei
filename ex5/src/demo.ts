import { createApp, installProcessGuards } from './app.js';

/**
 * Kich ban demo: 3 loai hanh vi lam dung + 2 luong khach that, chay tren server that (HTTP).
 * Cuoi cung in bao cao chan / chan nham va vai dong nhat ky chan.
 */
installProcessGuards();
const app = await createApp(false);
await app.listen(0);
const url = await app.getUrl();
const PRODUCT = 'FS-IPHONE';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ADMIN = { 'content-type': 'application/json', 'x-admin-token': 'admin-secret' };

function client(device: string, ip: string) {
  const headers = (extra: Record<string, string> = {}) => ({ 'content-type': 'application/json', 'x-device-id': device, 'x-forwarded-for': ip, ...extra });
  return {
    view: async () => fetch(`${url}/flash-sale/products/${PRODUCT}`, { headers: headers() }),
    order: async (user: string, body: object, extra: Record<string, string> = {}) =>
      fetch(`${url}/flash-sale/products/${PRODUCT}/orders`, { method: 'POST', headers: headers({ 'x-user-id': user, ...extra }), body: JSON.stringify(body) }),
    solve: async (id: string, answer: string) =>
      fetch(`${url}/shield/challenges/${id}/solve`, { method: 'POST', headers: headers(), body: JSON.stringify({ answer }) }),
  };
}

function tally(statuses: number[]) {
  const counts = new Map<number, number>();
  for (const s of statuses) counts.set(s, (counts.get(s) ?? 0) + 1);
  return [...counts].map(([s, n]) => `${s} x${n}`).join(', ');
}

async function viewThenOrder(c: ReturnType<typeof client>, user: string, waitMs: number, extra: Record<string, string> = {}) {
  const { viewToken } = await (await c.view()).json();
  await sleep(waitMs);
  return c.order(user, { viewToken, quantity: 1 }, extra);
}

console.log('=== Doi nguong luc dang chay: ha minViewToOrderMs xuong 800ms de demo chay nhanh (khong khoi dong lai)');
const patch = await fetch(`${url}/admin/shield/policies`, { method: 'PATCH', headers: ADMIN, body: JSON.stringify({ behavior: { minViewToOrderMs: 800 } }) });
console.log(`PATCH /admin/shield/policies -> ${patch.status}\n`);

// --- 1. Bot ban don dap tu mot thiet bi ---
{
  const bot = client('bot-flood-device', '203.0.113.10');
  const statuses: number[] = [];
  for (let i = 0; i < 100; i++) statuses.push((await bot.view()).status);
  console.log('[Lam dung 1] Bot lam moi trang 100 lan lien tiep tu 1 thiet bi');
  console.log(`  -> ${tally(statuses)}  (lop Toc do chan tu request thu 21)\n`);
}

// --- 2. Bot goi thang API dat hang / dat sieu toc, xoay vong thiet bi de ne lop 1 ---
{
  const statuses: number[] = [];
  const rules = new Map<string, number>();
  for (let i = 0; i < 30; i++) {
    const bot = client(`bot-api-${i}`, `198.51.100.${i}`);
    const res = i % 2 === 0 ? await bot.order(`bot-acc-${i}`, { quantity: 2 }) : await viewThenOrder(bot, `bot-acc-${i}`, 50);
    statuses.push(res.status);
    if (res.status === 403) {
      const rule = (await res.json()).rule;
      rules.set(rule, (rules.get(rule) ?? 0) + 1);
    }
  }
  console.log('[Lam dung 2] Bot dat hang thang qua API (khong mo trang) hoac 50ms sau khi mo trang, moi lan 1 thiet bi moi');
  console.log(`  -> ${tally(statuses)}  (lop Hanh vi: ${[...rules].map(([r, n]) => `${r} x${n}`).join(', ')})\n`);
}

// --- 3. Mot thiet bi xoay 10 nick ao, gia lap thao tac cham nhu nguoi ---
{
  const farm = client('farm-phone', '192.0.2.50');
  const statuses: number[] = [];
  for (let i = 1; i <= 10; i++) statuses.push((await viewThenOrder(farm, `clone-${i}`, 850)).status);
  console.log('[Lam dung 3] 1 thiet bi dung 10 tai khoan khac nhau, moi tai khoan mua 1 (ne gioi han 2 sp/tai khoan)');
  console.log(`  -> ${tally(statuses)}  (lop Nick ao cho 3 tai khoan dau, chan tu tai khoan thu 4)\n`);
}

// --- 4. Khach that ---
{
  const lan = client('iphone-cua-lan', '100.64.1.20');
  const res = await viewThenOrder(lan, 'chi-lan', 1500);
  console.log('[Khach that] Chi Lan mo trang, doc 1,5 giay, dat 1 san pham');
  console.log(`  -> ${res.status} ${JSON.stringify(await res.json())}\n`);

  // Gia dinh 4 nguoi dung chung may tinh bang -> nguoi thu 4 bi nghi nham, giai thu thach, mua duoc
  const tablet = client('tablet-gia-dinh', '100.64.1.30');
  for (const user of ['bo', 'me', 'anh']) await viewThenOrder(tablet, user, 900);
  const blocked = await viewThenOrder(tablet, 'em', 900);
  const body = await blocked.json();
  const answer = String(body.challenge.question.match(/\d+/g).map(Number).reduce((a: number, b: number) => a + b));
  const { passToken } = await (await tablet.solve(body.challenge.id, answer)).json();
  const retry = await viewThenOrder(tablet, 'em', 900, { 'x-challenge-pass': passToken });
  console.log('[Khach that bi nghi nham] Nguoi thu 4 trong gia dinh dat tren may tinh bang chung');
  console.log(`  -> lan 1: ${blocked.status} (${body.layer}); giai "${body.challenge.question}" = ${answer}; dat lai: ${retry.status} -> tinh la 1 lan chan nham\n`);
}

const report = await (await fetch(`${url}/admin/shield/report`, { headers: ADMIN })).json();
console.log('=== Bao cao /admin/shield/report');
console.log(`Tong request: ${report.requests}, bi chan: ${report.blocked} (${(report.blockRate * 100).toFixed(1)}%)`);
console.log(`Chan nham da xac nhan: ${report.falsePositives} -> ti le chan nham ${(report.falsePositiveRate * 100).toFixed(2)}%`);
for (const l of report.byLayer) console.log(`  ${l.layer.padEnd(13)} chan ${String(l.blocked).padStart(3)}, chan nham ${l.falsePositives} (${(l.falsePositiveRate * 100).toFixed(2)}%)`);

const logs = await (await fetch(`${url}/admin/shield/logs?limit=3`, { headers: ADMIN })).json();
console.log('\n=== 3 dong nhat ky chan gan nhat (/admin/shield/logs)');
for (const log of logs) console.log(JSON.stringify(log));

await app.close();
