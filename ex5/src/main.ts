import { Redis } from 'ioredis';
import RedisMock from 'ioredis-mock';
import type { RedisLike } from './cache/redis-cache.client.js';
import { createApp } from './http/app.js';

// Co REDIS_URL thi dung Redis that (khong xep hang lenh khi mat ket noi -> loi ngay, tang dem tu di thang CSDL)
const redis: RedisLike = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, { enableOfflineQueue: false, maxRetriesPerRequest: 1 })
  : (new RedisMock() as unknown as RedisLike);

const { app } = await createApp({ redis });
await app.listen(3000);
console.log('ShopFast chay tai http://localhost:3000');
console.log('GET /categories | GET /products/:id | PATCH /products/:id/price');
console.log('GET /cart, POST /cart/items (header x-user-id) | GET /reports/top-sellers?category=ao');
console.log('GET /cache/stats - ti le trung theo tung loai du lieu');
