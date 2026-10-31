'use strict';
// Chạy: node mo-phong.js   -> in bảng kết quả và ghi ket-qua-mo-phong.txt
// Quyền của một người = hợp (union) mọi chính sách của mọi nhóm họ thuộc về, sau đó Deny tường minh thắng tất cả.
const fs = require('fs');
const path = require('path');
const { evaluate, short } = require('./sim/iam-sim');

const ACC = '123456789012';
const read = (p) => JSON.parse(fs.readFileSync(path.join(__dirname, p), 'utf8'));
const structure = read('iam-structure.json');

const MANAGED_FILES = {
  PowerUserAccess: 'policies/aws-managed/PowerUserAccess.json',
  ReadOnlyAccess: 'policies/aws-managed/ReadOnlyAccess.trich-luoc.json',
  AWSBillingReadOnlyAccess: 'policies/aws-managed/AWSBillingReadOnlyAccess.trich-luoc.json',
};

function groupPolicies(group) {
  const g = structure.groups[group];
  return [
    ...g.custom.map((n) => ({ name: `${group}/${n}`, doc: read(`policies/${n}.json`) })),
    ...g.aws_managed.map((n) => ({ name: `${group}/aws:${n}`, doc: read(MANAGED_FILES[n]) })),
  ];
}

function userPolicies(groups, extra = []) {
  return [...groups.flatMap(groupPolicies), ...extra];
}

function userGroups(name) {
  return structure.users.find((u) => u.name === name).groups;
}

const NOW = '2026-11-15T09:00:00Z';
const AFTER_EXPIRY = '2027-02-01T09:00:00Z';
const s3 = (bucket, key) => (key ? `arn:aws:s3:::${bucket}/${key}` : `arn:aws:s3:::${bucket}`);
const ec2 = (id) => `arn:aws:ec2:ap-southeast-1:${ACC}:instance/${id}`;
const logGroup = (g) => `arn:aws:logs:ap-southeast-1:${ACC}:log-group:${g}:log-stream:2026/11/15`;

function ctxFor(user, team, opts = {}) {
  const c = {
    'aws:username': user,
    'aws:CurrentTime': opts.time || NOW,
    'aws:PrincipalTag/Team': team,
  };
  if (opts.mfa) { c['aws:MultiFactorAuthPresent'] = 'true'; c['aws:MultiFactorAuthAge'] = '300'; }
  if (opts.extra) Object.assign(c, opts.extra);
  return c;
}

const IAM_ADMIN_ROLE = `arn:aws:iam::${ACC}:role/ShopFast-IamAdmin`;
const iamAdminPerm = { name: 'ShopFast-IamAdmin-Permissions', doc: read('roles/ShopFast-IamAdmin.permissions.json') };
const iamAdminTrust = { name: 'ShopFast-IamAdmin.trust', doc: read('roles/ShopFast-IamAdmin.trust.json') };
const denyAll = { name: 'user/ShopFast-DenyAll', doc: read('policies/ShopFast-DenyAll.json') };

// --- tình huống ---------------------------------------------------------------
// who: tên user (lấy nhóm từ iam-structure.json) hoặc groups ghi đè
const S = [];
const add = (o) => S.push(o);

// Lập trình viên backend
add({ g: 'Backend', who: 'dev-an', desc: 'Ghi object vào bucket dev', action: 's3:PutObject', res: s3('shopfast-dev-assets', 'a.png'), expect: 'Allow' });
add({ g: 'Backend', who: 'dev-an', desc: 'Ghi object vào bucket prod', action: 's3:PutObject', res: s3('shopfast-prod-assets', 'a.png'), expect: 'ImplicitDeny' });
add({ g: 'Backend', who: 'dev-an', desc: 'Đọc object bucket prod (chỉ đọc)', action: 's3:GetObject', res: s3('shopfast-prod-assets', 'a.png'), expect: 'Allow' });
add({ g: 'Backend', who: 'dev-an', desc: 'Huỷ máy chủ gắn thẻ dev', action: 'ec2:TerminateInstances', res: ec2('i-dev01'), extra: { 'aws:ResourceTag/Environment': 'dev' }, expect: 'Allow' });
add({ g: 'Backend', who: 'dev-an', desc: 'Huỷ máy chủ gắn thẻ prod', action: 'ec2:TerminateInstances', res: ec2('i-prod01'), extra: { 'aws:ResourceTag/Environment': 'prod' }, expect: 'ExplicitDeny' });
add({ g: 'Backend', who: 'dev-an', desc: 'Huỷ máy chủ prod (kể cả có MFA)', action: 'ec2:TerminateInstances', res: ec2('i-prod01'), mfa: true, extra: { 'aws:ResourceTag/Environment': 'prod' }, expect: 'ImplicitDeny' });
add({ g: 'Backend', who: 'dev-an', desc: 'Tạo máy chủ gắn thẻ prod', action: 'ec2:RunInstances', res: ec2('*'), extra: { 'aws:RequestTag/Environment': 'prod' }, expect: 'ImplicitDeny' });
add({ g: 'Backend', who: 'dev-an', desc: 'Gán role ứng dụng prod cho Lambda', action: 'iam:PassRole', res: `arn:aws:iam::${ACC}:role/shopfast-prod-app-api`, extra: { 'iam:PassedToService': 'lambda.amazonaws.com' }, expect: 'ImplicitDeny' });
add({ g: 'Backend', who: 'dev-an', desc: 'Cập nhật Lambda dev', action: 'lambda:UpdateFunctionCode', res: `arn:aws:lambda:ap-southeast-1:${ACC}:function:shopfast-dev-order`, expect: 'Allow' });

// Vận hành
add({ g: 'Ops', who: 'ops-khanh', desc: 'Tạo máy chủ prod', action: 'ec2:RunInstances', res: ec2('*'), extra: { 'aws:RequestTag/Environment': 'prod' }, expect: 'Allow' });
add({ g: 'Ops', who: 'ops-khanh', desc: 'Huỷ máy chủ prod KHÔNG có MFA', action: 'ec2:TerminateInstances', res: ec2('i-prod01'), extra: { 'aws:ResourceTag/Environment': 'prod' }, expect: 'ExplicitDeny' });
add({ g: 'Ops', who: 'ops-khanh', desc: 'Huỷ máy chủ prod CÓ MFA', action: 'ec2:TerminateInstances', res: ec2('i-prod01'), mfa: true, extra: { 'aws:ResourceTag/Environment': 'prod' }, expect: 'Allow' });
add({ g: 'Ops', who: 'ops-khanh', desc: 'Xoá bucket sao lưu prod KHÔNG MFA', action: 's3:DeleteBucket', res: s3('shopfast-prod-db-backup'), expect: 'ExplicitDeny' });
add({ g: 'Ops', who: 'ops-khanh', desc: 'Xoá bucket sao lưu prod CÓ MFA', action: 's3:DeleteBucket', res: s3('shopfast-prod-db-backup'), mfa: true, expect: 'Allow' });
add({ g: 'Ops', who: 'ops-khanh', desc: 'Xoá bucket dev không MFA', action: 's3:DeleteBucket', res: s3('shopfast-dev-tmp'), expect: 'Allow' });
add({ g: 'Ops', who: 'ops-khanh', desc: 'Tự gắn AdministratorAccess', action: 'iam:AttachUserPolicy', res: `arn:aws:iam::${ACC}:user/ops-khanh`, mfa: true, expect: 'ImplicitDeny' });
add({ g: 'Ops', who: 'ops-khanh', desc: 'Tắt CloudTrail (kể cả có MFA)', action: 'cloudtrail:StopLogging', res: `arn:aws:cloudtrail:ap-southeast-1:${ACC}:trail/shopfast-audit`, mfa: true, expect: 'ExplicitDeny' });
add({ g: 'Ops', who: 'ops-khanh', desc: 'Xoá file nhật ký kiểm toán', action: 's3:DeleteObject', res: s3('shopfast-audit-logs', 'AWSLogs/x.json.gz'), mfa: true, expect: 'ExplicitDeny' });

// Dữ liệu
add({ g: 'Data', who: 'data-nam', desc: 'Đọc dữ liệu phân tích', action: 's3:GetObject', res: s3('shopfast-analytics', 'sales/2026-10.parquet'), expect: 'Allow' });
add({ g: 'Data', who: 'data-nam', desc: 'Ghi vào bucket phân tích', action: 's3:PutObject', res: s3('shopfast-analytics', 'x.csv'), expect: 'ImplicitDeny' });
add({ g: 'Data', who: 'data-nam', desc: 'Đọc dữ liệu khách hàng prod', action: 's3:GetObject', res: s3('shopfast-prod-customer-data', 'c.csv'), expect: 'ImplicitDeny' });
add({ g: 'Data', who: 'data-nam', desc: 'Xem danh sách máy chủ', action: 'ec2:DescribeInstances', res: '*', expect: 'ImplicitDeny' });

// Kế toán
add({ g: 'Finance', who: 'ketoan-phuong', desc: 'Xem chi phí theo dịch vụ', action: 'ce:GetCostAndUsage', res: '*', expect: 'Allow' });
add({ g: 'Finance', who: 'ketoan-phuong', desc: 'Xem hoá đơn', action: 'invoicing:ListInvoiceSummaries', res: '*', expect: 'Allow' });
add({ g: 'Finance', who: 'ketoan-phuong', desc: 'Sửa phương thức thanh toán', action: 'payments:UpdatePaymentPreferences', res: '*', expect: 'ImplicitDeny' });
add({ g: 'Finance', who: 'ketoan-phuong', desc: 'Đọc bucket dev', action: 's3:GetObject', res: s3('shopfast-dev-assets', 'a.png'), expect: 'ImplicitDeny' });

// Đối tác
add({ g: 'Partner', who: 'partner-quang', desc: 'Đọc log payment-gateway (còn hạn)', action: 'logs:GetLogEvents', res: logGroup('/shopfast/prod/payment-gateway'), expect: 'Allow' });
add({ g: 'Partner', who: 'partner-quang', desc: 'Đọc log order-service', action: 'logs:GetLogEvents', res: logGroup('/shopfast/prod/order-service'), expect: 'ImplicitDeny' });
add({ g: 'Partner', who: 'partner-quang', desc: 'Đọc log payment-gateway SAU 90 ngày', action: 'logs:GetLogEvents', res: logGroup('/shopfast/prod/payment-gateway'), time: AFTER_EXPIRY, expect: 'ExplicitDeny' });
add({ g: 'Partner', who: 'partner-quang', desc: 'Đổi mật khẩu SAU 90 ngày', action: 'iam:ChangePassword', res: `arn:aws:iam::${ACC}:user/partner-quang`, time: AFTER_EXPIRY, expect: 'ExplicitDeny' });
add({ g: 'Partner', who: 'partner-quang', desc: 'Tự tạo access key dài hạn', action: 'iam:CreateAccessKey', res: `arn:aws:iam::${ACC}:user/partner-quang`, expect: 'ExplicitDeny' });

// Bẫy: một người thuộc hai nhóm có quyền mâu thuẫn
const DEV_DATA = ['All-Staff', 'Backend-Developers', 'Data-Engineers'];
const DEV_OPS = ['All-Staff', 'Backend-Developers', 'Ops-Engineers'];
const OPS_PARTNER = ['All-Staff', 'Ops-Engineers', 'External-Partners'];
add({ g: 'Conflict', who: 'dev-binh', groups: DEV_DATA, desc: 'Dev+Data: đọc dữ liệu phân tích', action: 's3:GetObject', res: s3('shopfast-analytics', 'x'), expect: 'Allow' });
add({ g: 'Conflict', who: 'dev-binh', groups: DEV_DATA, desc: 'Dev+Data: ghi bucket prod', action: 's3:PutObject', res: s3('shopfast-prod-assets', 'x'), expect: 'ImplicitDeny' });
add({ g: 'Conflict', who: 'dev-binh', groups: DEV_OPS, desc: 'Dev+Ops: ghi bucket prod', action: 's3:PutObject', res: s3('shopfast-prod-assets', 'x'), expect: 'Allow' });
add({ g: 'Conflict', who: 'dev-binh', groups: DEV_OPS, desc: 'Dev+Ops: huỷ máy prod không MFA', action: 'ec2:TerminateInstances', res: ec2('i-prod01'), extra: { 'aws:ResourceTag/Environment': 'prod' }, expect: 'ExplicitDeny' });
add({ g: 'Conflict', who: 'ops-lam', groups: OPS_PARTNER, desc: 'Ops+Partner: tạo máy chủ (còn hạn)', action: 'ec2:RunInstances', res: ec2('*'), expect: 'Allow' });
add({ g: 'Conflict', who: 'ops-lam', groups: OPS_PARTNER, desc: 'Ops+Partner: tạo máy chủ (sau hạn)', action: 'ec2:RunInstances', res: ec2('*'), time: AFTER_EXPIRY, expect: 'ExplicitDeny' });

// Bẫy: nhân viên nghỉ việc (đã gắn ShopFast-DenyAll ở bước 1, chưa kịp gỡ nhóm)
add({ g: 'Offboard', who: 'dev-hoa', offboarded: true, desc: 'Đọc bucket dev sau thu hồi', action: 's3:GetObject', res: s3('shopfast-dev-assets', 'a'), expect: 'ExplicitDeny' });
add({ g: 'Offboard', who: 'dev-hoa', offboarded: true, desc: 'Tạo access key mới sau thu hồi', action: 'iam:CreateAccessKey', res: `arn:aws:iam::${ACC}:user/dev-hoa`, expect: 'ExplicitDeny' });

// Role ShopFast-IamAdmin (phiên đã assume)
add({ g: 'IamAdmin', role: true, desc: 'Thêm user vào nhóm', action: 'iam:AddUserToGroup', res: `arn:aws:iam::${ACC}:group/Backend-Developers`, expect: 'Allow' });
add({ g: 'IamAdmin', role: true, desc: 'Gắn ShopFast-DenyAll cho user nghỉ', action: 'iam:AttachUserPolicy', res: `arn:aws:iam::${ACC}:user/dev-hoa`, extra: { 'iam:PolicyARN': `arn:aws:iam::${ACC}:policy/ShopFast-DenyAll` }, expect: 'Allow' });
add({ g: 'IamAdmin', role: true, desc: 'Gắn AdministratorAccess cho user', action: 'iam:AttachUserPolicy', res: `arn:aws:iam::${ACC}:user/dev-an`, extra: { 'iam:PolicyARN': 'arn:aws:iam::aws:policy/AdministratorAccess' }, expect: 'ImplicitDeny' });
add({ g: 'IamAdmin', role: true, desc: 'Sửa chính sách Guardrails', action: 'iam:CreatePolicyVersion', res: `arn:aws:iam::${ACC}:policy/ShopFast-Guardrails`, expect: 'ExplicitDeny' });

// Đảm nhận Role ShopFast-IamAdmin (trust policy + identity policy phải cùng Allow)
add({ g: 'AssumeRole', who: 'ops-khanh', assume: true, desc: 'Ops assume IamAdmin có MFA', mfa: true, expect: 'Allow' });
add({ g: 'AssumeRole', who: 'ops-khanh', assume: true, desc: 'Ops assume IamAdmin không MFA', expect: 'ImplicitDeny' });
add({ g: 'AssumeRole', who: 'dev-an', assume: true, desc: 'Dev assume IamAdmin có MFA', mfa: true, expect: 'ImplicitDeny' });

// --- chạy ---------------------------------------------------------------------
const lines = [];
const log = (s = '') => { lines.push(s); console.log(s); };
log(`KẾT QUẢ MÔ PHỎNG - ShopFast IAM (thời điểm mặc định ${NOW}, hết hạn đối tác 2027-01-29)`);
log('='.repeat(122));
log(['#'.padEnd(3), 'Nhóm'.padEnd(10), 'Người'.padEnd(14), 'Tình huống'.padEnd(40), 'Kết quả'.padEnd(18), 'Mong đợi'.padEnd(13), 'Đạt'].join(' | '));
log('-'.repeat(122));

let fail = 0;
S.forEach((s, i) => {
  let result;
  let who = s.who || 'IamAdmin(role)';
  if (s.role) {
    const ctx = { 'aws:CurrentTime': NOW, 'aws:SourceIdentity': 'ops-khanh', ...(s.extra || {}) };
    result = evaluate(
      { identity: [iamAdminPerm], boundary: iamAdminPerm },
      { principal: `arn:aws:sts::${ACC}:assumed-role/ShopFast-IamAdmin/ops-khanh`, action: s.action, resource: s.res, context: ctx }
    );
  } else {
    const team = structure.users.find((u) => u.name === s.who).team;
    const groups = s.groups || userGroups(s.who);
    const ctx = ctxFor(s.who, team, s);
    const principal = `arn:aws:iam::${ACC}:user/${s.who}`;
    const identity = userPolicies(groups, s.offboarded ? [denyAll] : []);
    if (s.assume) {
      const req = { principal, action: 'sts:AssumeRole', resource: IAM_ADMIN_ROLE, context: { ...ctx, 'aws:PrincipalArn': principal } };
      const idRes = evaluate({ identity }, req);
      const trustRes = evaluate({ resource: [iamAdminTrust] }, req);
      result = idRes.decision !== 'Allow' ? idRes
        : trustRes.decision !== 'Allow' ? { decision: 'ImplicitDeny', by: ['trust policy không khớp'] }
        : { decision: 'Allow', by: [...idRes.by, ...trustRes.by] };
    } else {
      result = evaluate({ identity }, { principal, action: s.action, resource: s.res, context: ctx });
    }
  }
  const ok = result.decision === s.expect;
  if (!ok) fail++;
  log([String(i + 1).padEnd(3), s.g.padEnd(10), who.padEnd(14), s.desc.padEnd(40), short(result.decision).padEnd(18), short(s.expect).replace(' (tường minh)', '*').replace(' (ngầm định)', '').padEnd(13), ok ? 'OK' : 'SAI'].join(' | '));
  log(`      ${s.action || 'sts:AssumeRole'}  <-  ${result.by.join(', ')}`);
});
log('-'.repeat(122));
log(`Tổng: ${S.length} tình huống, ${S.length - fail} đạt, ${fail} sai.   (DENY* = Deny tường minh)`);
fs.writeFileSync(path.join(__dirname, 'ket-qua-mo-phong.txt'), lines.join('\n') + '\n');
process.exitCode = fail ? 1 : 0;
