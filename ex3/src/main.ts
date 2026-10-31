import { Redis } from 'ioredis';
import RedisMock from 'ioredis-mock';
import { createApp } from './app.js';

// Co REDIS_URL thi dung Redis that, khong thi dung Redis gia lap trong bo nho
const redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL) : (new RedisMock() as unknown as Redis);

const app = await createApp({ redis });
await app.listen(3000);
console.log('ShopFast catalog chay tai http://localhost:3000');
console.log('Loc      : GET   /catalog?category=ao&brand=nike,adidas&minPrice=100000&maxPrice=500000&sort=price_asc&page=1');
console.log('Doi gia  : PATCH /products/:id/price  body {"price":120000}');
console.log('Doi kho  : PATCH /products/:id/stock  body {"stock":5}');
