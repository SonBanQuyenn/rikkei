// Tạo client AWS KHÔNG truyền credentials.
// SDK v3 dùng chuỗi provider mặc định của Node.js, thử lần lượt:
//   1. biến môi trường (chỉ credential tạm - xem assertNoLongTermKeys)
//   2. SSO token cache            -> máy lập trình viên (aws sso login)
//   3. web identity token file    -> pipeline / EKS
//   4. ~/.aws/config (credential_process) -> máy chủ ngoài cloud qua IAM Roles Anywhere
//   5. IMDSv2 của EC2             -> máy chủ trong cloud có Role gắn kèm
// Cả ba môi trường dùng CHUNG một mã nguồn; chỉ khác cấu hình bên ngoài.
// SDK tự làm mới credential tạm trước khi hết hạn - ứng dụng không phải xử lý xoay vòng IAM.
import { S3Client } from '@aws-sdk/client-s3';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { config, assertNoLongTermKeys } from './config.js';

assertNoLongTermKeys();

export const s3 = new S3Client({ region: config.region });
export const secretsManager = new SecretsManagerClient({ region: config.region });
const sts = new STSClient({ region: config.region });

/** Ghi log danh tính đang dùng - giúp phát hiện chạy nhầm profile/role. */
export async function logCallerIdentity(logger = console) {
  const id = await sts.send(new GetCallerIdentityCommand({}));
  logger.info(`[aws] đang chạy với danh tính ${id.Arn}`);
  return id;
}
