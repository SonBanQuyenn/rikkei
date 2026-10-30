import { startServer } from './app.js';

await startServer(Number(process.env.PORT ?? 3000));
console.log('Chat server chay tai http://localhost:3000');
