import { Redis } from 'ioredis';
import RedisMock from 'ioredis-mock';
import { createApp } from './app.js';
import { InventoryDb } from './db/inventory.db.js';

// Co REDIS_URL thi dung Redis that, khong thi dung Redis gia lap trong bo nho
const redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL) : (new RedisMock() as unknown as Redis);
const db = new InventoryDb();
db.seedProduct('FS-001', 1_000);

const app = await createApp({ redis, db });
await app.listen(3000);
console.log('ShopFast inventory chay tai http://localhost:3000');
console.log('Dat hang : POST /orders            body {"productId":"FS-001","userId":"u1","qty":1}');
console.log('Huy don  : POST /orders/:id/cancel');
console.log('Ton kho  : GET  /products/FS-001/stock');
