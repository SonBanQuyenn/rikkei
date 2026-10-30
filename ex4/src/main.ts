import { createApp } from './app.js';

const app = await createApp();
await app.listen(Number(process.env.PORT ?? 3000));
console.log('Bang dieu khien: http://localhost:3000');
