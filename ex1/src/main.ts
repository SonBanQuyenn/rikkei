import { createApp } from './app.js';
import { AppModule } from './fixed/app.module.js';

const app = await createApp(AppModule);
await app.listen(3000);
console.log('ShopFast API (ban da sua) chay tai http://localhost:3000');
