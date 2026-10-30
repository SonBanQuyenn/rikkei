import { AuthService, USERS } from './auth/auth.service.js';
import { startServer } from './app.module.js';

const app = await startServer(Number(process.env.PORT ?? 3000));
const auth = app.get(AuthService);
console.log('Trung tam dieu phoi chay tai ws://localhost:3000');
console.log('Token dung thu (8 gio):');
for (const id of Object.keys(USERS)) console.log(`  ${id.padEnd(5)} ${auth.issue(id)}`);
