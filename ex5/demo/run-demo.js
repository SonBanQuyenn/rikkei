'use strict';
// Kịch bản demo offline: node demo/run-demo.js   (kết quả ghi vào demo/ket-qua-demo.txt)
// Mỗi yêu cầu được đánh giá qua đủ các lớp: SCP (tổ chức) -> identity (permission set / role) -> resource policy.
const fs = require('fs');
const path = require('path');
const { evaluate, short } = require('./sim/iam-sim');

const ROOT = path.join(__dirname, '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const DEV = '111111111111';
const PROD = '222222222222';

// --- các lớp chính sách -----------------------------------------------------------
const P = {
  fullAccess: { name: 'FullAWSAccess', doc: read('policies/aws-managed/FullAWSAccess.scp.json') },
  baseline: { name: 'shopfast-baseline', doc: read('policies/scp/scp-baseline.json') },
  revoked: { name: 'shopfast-revoked-sessions', doc: read('policies/scp/scp-revoked-sessions.json') },
  prodData: { name: 'shopfast-prod-data', doc: read('policies/scp/scp-prod-data-protection.json') },
  viewOnly: { name: 'aws:ViewOnlyAccess', doc: read('policies/aws-managed/ViewOnlyAccess.trich-luoc.json') },
  powerUser: { name: 'aws:PowerUserAccess', doc: read('policies/aws-managed/PowerUserAccess.json') },
  admin: { name: 'aws:AdministratorAccess', doc: read('policies/aws-managed/AdministratorAccess.json') },
  intern: { name: 'Intern-inline', doc: read('policies/permission-sets/intern-dev.json') },
  devProdDebug: { name: 'DeveloperProdView-inline', doc: read('policies/permission-sets/developer-prod-debug.json') },
  operator: { name: 'Operator-inline', doc: read('policies/permission-sets/operator-prod.json') },
  appRuntime: { name: 'shopfast-prod-app-api', doc: read('roles/app-runtime.permissions.json') },
  ciTrust: { name: 'ci-deployer.trust', doc: read('roles/ci-deployer.trust.json') },
  backupBucket: { name: 'shopfast-prod-backup bucket policy', doc: read('policies/resource/prod-backup-bucket-policy.json') },
};

// SCP đang hiệu lực theo từng tài khoản (OU Prod có thêm shopfast-prod-data)
const scpsFor = (acct, revokedDoc) => {
  const list = [P.fullAccess, P.baseline, revokedDoc ? { name: P.revoked.name, doc: revokedDoc } : P.revoked];
  if (acct === PROD) list.push(P.prodData);
  return list;
};

// Danh tính người dùng = role do IAM Identity Center tạo cho permission set
function sso(acct, ps, email, policies) {
  const roleName = `AWSReservedSSO_${ps}_a1b2c3d4e5f6a7b8`;
  return {
    label: `${ps}@${acct === PROD ? 'prod' : 'dev'}`,
    acct,
    principal: `arn:aws:sts::${acct}:assumed-role/${roleName}/${email}`,
    ctx: {
      'aws:PrincipalArn': `arn:aws:iam::${acct}:role/aws-reserved/sso.amazonaws.com/ap-southeast-1/${roleName}`,
      'aws:userid': `AROAEXAMPLE${ps.toUpperCase()}:${email}`,
      'aws:PrincipalTag/username': email,
    },
    identity: policies,
  };
}
function role(acct, name, policies) {
  return {
    label: name,
    acct,
    principal: `arn:aws:sts::${acct}:assumed-role/${name}/session`,
    ctx: { 'aws:PrincipalArn': `arn:aws:iam::${acct}:role/${name}`, 'aws:userid': `AROAEXAMPLEROLE:session` },
    identity: policies,
  };
}

const intern = sso(DEV, 'Intern', 'thuctap.binh@shopfast.vn', [P.viewOnly, P.intern]);
const internProd = sso(PROD, 'Intern', 'thuctap.binh@shopfast.vn', []); // không có gán nào ở prod
const developer = sso(DEV, 'Developer', 'an.nguyen@shopfast.vn', [P.powerUser]);
const developerProd = sso(PROD, 'DeveloperProdView', 'an.nguyen@shopfast.vn', [P.viewOnly, P.devProdDebug]);
const operator = sso(PROD, 'Operator', 'lan.tran@shopfast.vn', [P.viewOnly, P.operator]);
const breakGlass = sso(PROD, 'BreakGlass', 'lan.tran@shopfast.vn', [P.powerUser]);
const app = role(PROD, 'shopfast-prod-app-api', [P.appRuntime]);
const legacyAdmin = role(PROD, 'shopfast-legacy-admin', [P.admin]); // role bị cấu hình sai

const s3 = (b, k) => (k ? `arn:aws:s3:::${b}/${k}` : `arn:aws:s3:::${b}`);
const RESOURCE_POLICIES = { 'shopfast-prod-backup': [P.backupBucket] };
const resourcePoliciesFor = (res) => {
  const m = res.match(/^arn:aws:s3:::([^/]+)/);
  return m && RESOURCE_POLICIES[m[1]] ? RESOURCE_POLICIES[m[1]] : [];
};

function run(who, action, resource, extraCtx = {}, opts = {}) {
  const policies = {
    scps: scpsFor(who.acct, opts.revokedDoc),
    identity: who.identity,
    resource: resourcePoliciesFor(resource),
  };
  return evaluate(policies, { principal: who.principal, action, resource, context: { ...who.ctx, ...extraCtx } });
}

// Đánh giá TỪNG lớp riêng rẽ để chỉ ra lớp nào tự nó đã chặn được
function layers(who, action, resource) {
  const req = { principal: who.principal, action, resource, context: who.ctx };
  const out = {};
  out['SCP'] = evaluate({ scps: scpsFor(who.acct), identity: [P.admin] }, req).decision;
  out['Đặc quyền tối thiểu (identity)'] = evaluate({ identity: who.identity }, req).decision;
  const rp = resourcePoliciesFor(resource);
  out['Resource policy'] = rp.length ? evaluate({ identity: [P.admin], resource: rp }, req).decision : '(không có)';
  return out;
}

// --- kịch bản -------------------------------------------------------------------
const lines = [];
const log = (s = '') => { lines.push(s); console.log(s); };
let fail = 0;
function scenario(id, who, desc, action, resource, expect, extraCtx, opts) {
  const r = run(who, action, resource, extraCtx, opts);
  const ok = r.decision === expect;
  if (!ok) fail++;
  log(`${id.padEnd(4)} ${who.label.padEnd(26)} ${desc.padEnd(52)} => ${short(r.decision).padEnd(18)} ${ok ? 'OK' : 'SAI (mong đợi ' + expect + ')'}`);
  log(`     ${action} ${resource}`);
  log(`     quyết định bởi: ${r.by.join(' | ')}`);
}

log('DEMO NỀN TẢNG QUẢN TRỊ TRUY CẬP SHOPFAST');
log('Tài khoản: dev=111111111111, prod=222222222222. Thứ tự đánh giá: Deny tường minh (mọi lớp) > SCP Allow > identity/resource Allow.');
log('');
log('== PHẦN 1. THAO TÁC ĐƯỢC PHÉP ==========================================================================================');
scenario('A1', intern, 'Thực tập sinh ghi file vào sandbox dev', 's3:PutObject', s3('shopfast-dev-sandbox-binh', 'test.json'), 'Allow');
scenario('A2', developer, 'Lập trình viên cập nhật Lambda dev', 'lambda:UpdateFunctionCode', `arn:aws:lambda:ap-southeast-1:${DEV}:function:shopfast-dev-cart`, 'Allow');
scenario('A3', developerProd, 'Lập trình viên đọc log ứng dụng prod để gỡ lỗi', 'logs:FilterLogEvents', `arn:aws:logs:ap-southeast-1:${PROD}:log-group:/shopfast/prod/app/api`, 'Allow');
scenario('A4', operator, 'Vận hành khởi động lại CSDL prod', 'rds:RebootDBInstance', `arn:aws:rds:ap-southeast-1:${PROD}:db:shopfast-prod-main`, 'Allow');
scenario('A5', operator, 'Vận hành khôi phục từ bản sao lưu', 'backup:StartRestoreJob', `arn:aws:backup:ap-southeast-1:${PROD}:recovery-point:abc`, 'Allow');
scenario('A6', app, 'Ứng dụng xoá file tạm của chính nó', 's3:DeleteObject', s3('shopfast-prod-media', 'tmp/upload-123.part'), 'Allow');
scenario('A7', breakGlass, 'BreakGlass (đã duyệt) xoá bảng cũ', 'dynamodb:DeleteTable', `arn:aws:dynamodb:ap-southeast-1:${PROD}:table/shopfast-prod-legacy-carts`, 'Allow');
log('');
log('== PHẦN 2. BỊ CHẶN BỞI ĐẶC QUYỀN TỐI THIỂU (không ai cấp quyền -> Deny ngầm định) ===========================================');
scenario('B1', internProd, 'Thực tập sinh đọc dữ liệu khách hàng prod', 's3:GetObject', s3('shopfast-prod-customer-data', 'customers.csv'), 'ImplicitDeny');
scenario('B2', intern, 'Thực tập sinh xoá bucket dùng chung ở dev', 's3:DeleteBucket', s3('shopfast-dev-assets'), 'ImplicitDeny');
scenario('B3', developerProd, 'Lập trình viên đọc dữ liệu khách hàng prod', 's3:GetObject', s3('shopfast-prod-customer-data', 'customers.csv'), 'ImplicitDeny');
scenario('B4', developerProd, 'Lập trình viên sửa cấu hình máy prod', 'ec2:ModifyInstanceAttribute', `arn:aws:ec2:ap-southeast-1:${PROD}:instance/i-prod01`, 'ImplicitDeny');
scenario('B5', operator, 'Vận hành huỷ máy chủ prod', 'ec2:TerminateInstances', `arn:aws:ec2:ap-southeast-1:${PROD}:instance/i-prod01`, 'ImplicitDeny', { 'aws:ResourceTag/Environment': 'prod' });
scenario('B6', app, 'Ứng dụng xoá ảnh sản phẩm thật', 's3:DeleteObject', s3('shopfast-prod-media', 'products/123.jpg'), 'ImplicitDeny');
log('');
log('== PHẦN 3. IDENTITY CHO PHÉP NHƯNG BỊ CHẶN BỞI LỚP KIỂM SOÁT BỔ SUNG (Deny tường minh) =====================================');
scenario('C1', legacyAdmin, 'Role lỡ gắn AdministratorAccess xoá bucket prod', 's3:DeleteBucket', s3('shopfast-prod-orders-archive'), 'ExplicitDeny');
scenario('C2', legacyAdmin, 'Role admin xoá CSDL prod', 'rds:DeleteDBInstance', `arn:aws:rds:ap-southeast-1:${PROD}:db:shopfast-prod-main`, 'ExplicitDeny');
scenario('C3', breakGlass, 'BreakGlass xoá file trong bucket sao lưu', 's3:DeleteObject', s3('shopfast-prod-backup', 'db/2026-10-30.sql.gz'), 'ExplicitDeny');
scenario('C4', breakGlass, 'BreakGlass xoá bucket sao lưu', 's3:DeleteBucket', s3('shopfast-prod-backup'), 'ExplicitDeny');
scenario('C5', legacyAdmin, 'Role admin tạo access key dài hạn', 'iam:CreateAccessKey', `arn:aws:iam::${PROD}:user/svc-legacy`, 'ExplicitDeny');
scenario('C6', legacyAdmin, 'Role admin tắt CloudTrail', 'cloudtrail:StopLogging', `arn:aws:cloudtrail:ap-southeast-1:999999999999:trail/shopfast-org-trail`, 'ExplicitDeny');
scenario('C7', legacyAdmin, 'Role admin sửa trust của role ứng dụng', 'iam:UpdateAssumeRolePolicy', `arn:aws:iam::${PROD}:role/shopfast-prod-app-api`, 'ExplicitDeny');
const revokedDoc = JSON.parse(JSON.stringify(P.revoked.doc));
revokedDoc.Statement[0].Condition.StringLike['aws:userid'].push('*:an.nguyen@shopfast.vn');
scenario('C8', developer, 'Phiên cũ của người vừa bị thu hồi ghi S3 dev', 's3:PutObject', s3('shopfast-dev-assets', 'x'), 'ExplicitDeny', {}, { revokedDoc });
log('');
log('== PHẦN 4. MÁY: PIPELINE KHÔNG CÓ KHOÁ DÀI HẠN =============================================================================');
const oidc = `arn:aws:iam::${PROD}:oidc-provider/token.actions.githubusercontent.com`;
for (const [id, sub, expect] of [
  ['M1', 'repo:shopfast/backend:ref:refs/heads/main', 'Allow'],
  ['M2', 'repo:shopfast/backend:ref:refs/heads/feature-x', 'ImplicitDeny'],
  ['M3', 'repo:shopfast-evil/backend:ref:refs/heads/main', 'ImplicitDeny'],
]) {
  const r = evaluate({ resource: [P.ciTrust] }, {
    principal: oidc, action: 'sts:AssumeRoleWithWebIdentity', resource: `arn:aws:iam::${PROD}:role/shopfast-ci-backend-deployer`,
    context: { 'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com', 'token.actions.githubusercontent.com:sub': sub },
  });
  const ok = r.decision === expect;
  if (!ok) fail++;
  log(`${id.padEnd(4)} ${'GitHub OIDC'.padEnd(26)} ${sub.padEnd(52)} => ${short(r.decision).padEnd(18)} ${ok ? 'OK' : 'SAI'}`);
}
log('');
log('== PHẦN 5. TÁI HIỆN SỰ CỐ: THỰC TẬP SINH XOÁ BUCKET SAO LƯU - TỪNG LỚP CÓ TỰ CHẶN ĐƯỢC KHÔNG? ==================================');
const incident = layers(internProd, 's3:DeleteBucket', s3('shopfast-prod-backup'));
for (const [k, v] of Object.entries(incident)) log(`     ${k.padEnd(32)} -> ${v === '(không có)' ? v : short(v)}`);
log('     + Object Lock COMPLIANCE 35 ngày (ngoài IAM): object còn hạn lưu giữ không thể xoá -> bucket không thể rỗng -> không thể xoá');
log('     + Nếu vẫn có người thử: rule EventBridge "prod-destructive-actions" + "guardrail-tampering" cảnh báo trong vài phút, CloudTrail ghi rõ email.');
log('');
log(`Tổng: ${fail === 0 ? 'mọi kịch bản đúng như thiết kế' : fail + ' kịch bản SAI'}.`);
fs.writeFileSync(path.join(__dirname, 'ket-qua-demo.txt'), lines.join('\n') + '\n');
process.exitCode = fail ? 1 : 0;
