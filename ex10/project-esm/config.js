import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
// Import trực tiếp file JSON trong ESM cần cú pháp import attribute
// (with { type: 'json' }) - đây là 1 trong những khác biệt lớn so với CJS.
import pkg from './package.json' with { type: 'json' };

// __dirname và __filename KHÔNG tồn tại sẵn trong ES Module.
// Phải tự dựng lại từ import.meta.url.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env'), quiet: true });

const PROCESSING_DELAY_MS = Number(process.env.PROCESSING_DELAY_MS) || 2000;
const LOG_TIMEZONE = process.env.LOG_TIMEZONE || 'UTC';

const config = {
  PROCESSING_DELAY_MS,
  LOG_TIMEZONE,
  APP_VERSION: pkg.version,
};

export default config;
