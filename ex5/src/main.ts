/**
 * Chay trung tam dieu hanh voi cau hinh that (cac he thong ben ngoai la ban gia lap).
 *   npm start  -> http://localhost:3000  (JSON: /api/dashboard, /api/alerts)
 */
import { consoleLogger } from './common/logger.js';
import { installProcessGuards, startSystem } from './bootstrap.js';
import { createFakePorts } from './tasks/fakes.js';

const logger = consoleLogger('control-center');
const port = Number(process.env.PORT ?? 3000);
const system = await startSystem({ ns: process.env.BULL_PREFIX ?? 'shopfast', port, ports: createFakePorts(), logger });
installProcessGuards(logger, system.shutdown);
logger.info(`Bang dieu khien: http://localhost:${port}`);
