'use strict';
// Chạy: node mo-phong.js
// So sánh quyết định của chính sách CŨ và chính sách MỚI trên cùng một bộ tình huống.
const fs = require('fs');
const path = require('path');
const { evaluate, short } = require('./sim/iam-sim');

const load = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8'));
const oldPolicy = { identity: [{ name: 'shopfast-developer (cũ)', doc: load('policy-cu.json') }] };
const newPolicy = { identity: [{ name: 'shopfast-developer (mới)', doc: load('policy-moi.json') }] };

const DEV = 'arn:aws:iam::123456789012:user/dev-an';

// expectNew: kết quả mong muốn với chính sách mới
const scenarios = [
  { id: 'TH1', desc: 'Đọc object trong bucket dev', action: 's3:GetObject', resource: 'arn:aws:s3:::shopfast-dev-assets/img/logo.png', expectNew: 'Allow' },
  { id: 'TH2', desc: 'Ghi object vào bucket dev', action: 's3:PutObject', resource: 'arn:aws:s3:::shopfast-dev-assets/build/app.zip', expectNew: 'Allow' },
  { id: 'TH3', desc: 'Liệt kê object trong bucket dev', action: 's3:ListBucket', resource: 'arn:aws:s3:::shopfast-dev-assets', expectNew: 'Allow' },
  { id: 'TH4', desc: 'Xem danh sách máy chủ', action: 'ec2:DescribeInstances', resource: '*', expectNew: 'Allow' },
  { id: 'TH5', desc: '[KK1] Xoá bucket sao lưu CSDL production', action: 's3:DeleteBucket', resource: 'arn:aws:s3:::shopfast-prod-db-backup', expectNew: 'ImplicitDeny' },
  { id: 'TH6', desc: '[KK1] Xoá file sao lưu CSDL production', action: 's3:DeleteObject', resource: 'arn:aws:s3:::shopfast-prod-db-backup/2026-10-30.sql.gz', expectNew: 'ImplicitDeny' },
  { id: 'TH7', desc: '[KK2] Tải dữ liệu khách hàng production', action: 's3:GetObject', resource: 'arn:aws:s3:::shopfast-prod-customer-data/customers.csv', expectNew: 'ImplicitDeny' },
  { id: 'TH8', desc: '[KK3] Sửa bucket policy để công khai bucket', action: 's3:PutBucketPolicy', resource: 'arn:aws:s3:::shopfast-dev-assets', expectNew: 'ImplicitDeny' },
  { id: 'TH9', desc: '[KK3] Xoá chính bucket dev', action: 's3:DeleteBucket', resource: 'arn:aws:s3:::shopfast-dev-assets', expectNew: 'ImplicitDeny' },
  { id: 'TH10', desc: '[KK4] Tự gắn AdministratorAccess cho mình', action: 'iam:AttachUserPolicy', resource: DEV, expectNew: 'ExplicitDeny' },
  { id: 'TH11', desc: '[KK4] Tạo access key cho user khác', action: 'iam:CreateAccessKey', resource: 'arn:aws:iam::123456789012:user/ops-admin', expectNew: 'ExplicitDeny' },
  { id: 'TH12', desc: '[KK4] Tạo user "cửa hậu"', action: 'iam:CreateUser', resource: 'arn:aws:iam::123456789012:user/backdoor', expectNew: 'ExplicitDeny' },
  { id: 'TH13', desc: '[KK5] Huỷ máy chủ production', action: 'ec2:TerminateInstances', resource: 'arn:aws:ec2:ap-southeast-1:123456789012:instance/i-0prod1234', expectNew: 'ImplicitDeny' },
  { id: 'TH14', desc: '[KK5] Mở security group ra 0.0.0.0/0', action: 'ec2:AuthorizeSecurityGroupIngress', resource: 'arn:aws:ec2:ap-southeast-1:123456789012:security-group/sg-0db', expectNew: 'ImplicitDeny' },
  { id: 'TH15', desc: '[Bẫy tiền tố] Đọc bucket shopfast-devops-secrets', action: 's3:GetObject', resource: 'arn:aws:s3:::shopfast-devops-secrets/db-password.txt', expectNew: 'ImplicitDeny' },
];

const lines = [];
const log = (s = '') => { lines.push(s); console.log(s); };

log('KẾT QUẢ MÔ PHỎNG CHÍNH SÁCH IAM - nhóm shopfast-developer');
log('Principal: ' + DEV);
log('='.repeat(118));
log(['ID'.padEnd(5), 'Tình huống'.padEnd(58), 'Chính sách CŨ'.padEnd(20), 'Chính sách MỚI'.padEnd(20), 'Đạt?'].join(' | '));
log('-'.repeat(118));

let fail = 0;
for (const s of scenarios) {
  const req = { principal: DEV, action: s.action, resource: s.resource, context: { 'aws:username': 'dev-an' } };
  const o = evaluate(oldPolicy, req);
  const n = evaluate(newPolicy, req);
  const ok = n.decision === s.expectNew;
  if (!ok) fail++;
  log([s.id.padEnd(5), s.desc.padEnd(58), short(o.decision).padEnd(20), short(n.decision).padEnd(20), ok ? 'OK' : 'SAI'].join(' | '));
  log(`      ${s.action} -> ${s.resource}`);
  log(`      mới: ${n.by.join(', ')}`);
}
log('-'.repeat(118));
log(`Tổng: ${scenarios.length} tình huống, ${scenarios.length - fail} đạt, ${fail} sai.`);

fs.writeFileSync(path.join(__dirname, 'ket-qua-mo-phong.txt'), lines.join('\n') + '\n');
process.exitCode = fail ? 1 : 0;
