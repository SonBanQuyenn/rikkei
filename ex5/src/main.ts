import { createApp } from './app';

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  console.error('Thieu JWT_SECRET');
  process.exit(1);
}

const app = createApp({ version: process.env.APP_VERSION ?? 'dev', jwtSecret });
const server = app.listen(Number(process.env.PORT ?? 3000), () => {
  console.log(`ShopFast ${process.env.APP_VERSION ?? 'dev'} san sang`);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
