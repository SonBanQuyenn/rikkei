import { createApp } from './app.js';

const app = await createApp();
await app.listen(3000);
console.log('Order gateway chay tai http://localhost:3000');
console.log('Doi trang thai: PATCH /orders/:id/status  body {"status":"SHIPPING"}');
