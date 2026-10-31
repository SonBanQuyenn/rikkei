import { createApp } from './app.js';

const app = await createApp();
await app.listen(3000);
console.log('ShopFast product API chay tai http://localhost:3000');
console.log('Xem san pham : GET   /products/:id');
console.log('Doi gia      : PATCH /products/:id  body {"price":120000}');
