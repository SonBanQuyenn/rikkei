import { createApp } from './app.js';

const app = await createApp();
await app.listen(3000);
console.log('ShopFast Partner API chay tai http://localhost:3000 (thu: curl -i -H "X-API-Key: key-free-001" localhost:3000/api/products)');
