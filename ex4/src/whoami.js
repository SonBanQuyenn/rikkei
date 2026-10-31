// Kiểm tra nhanh credential đang được SDK chọn ở môi trường hiện tại:
//   EC2:            node src/whoami.js  -> assumed-role/shopfast-prod-app-invoice/i-...
//   máy dev:        AWS_PROFILE=shopfast-dev node src/whoami.js -> assumed-role/AWSReservedSSO_ShopFastInvoiceDev_.../ten-dev
//   ngoài cloud:    AWS_PROFILE=shopfast-onprem-cron node src/whoami.js -> assumed-role/shopfast-prod-cron-invoice/<serial chứng chỉ>
import { logCallerIdentity } from './aws-clients.js';

await logCallerIdentity();
