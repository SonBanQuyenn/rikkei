import { createApp, installProcessGuards } from './app.js';

installProcessGuards();
const app = await createApp();
await app.listen(3000);
console.log('ShopFast flash sale + la chan chong lam dung chay tai http://localhost:3000');
