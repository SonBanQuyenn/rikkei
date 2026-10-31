'use strict';
/**
 * Bộ mô phỏng rút gọn logic đánh giá chính sách IAM của AWS (chạy offline, không cần tài khoản AWS).
 *
 * Thứ tự đánh giá (theo tài liệu "Policy evaluation logic" của AWS, rút gọn cho trường hợp cùng tài khoản):
 *   1. Có bất kỳ Deny tường minh nào khớp (ở mọi loại chính sách)      -> ExplicitDeny
 *   2. Có SCP mà không SCP nào Allow                                   -> ImplicitDeny
 *   3. Có resource policy Allow đúng principal                          -> Allow (cùng tài khoản)
 *   4. Không có identity policy nào Allow                               -> ImplicitDeny
 *   5. Có permissions boundary mà boundary không Allow                  -> ImplicitDeny
 *   6. Có session policy mà session policy không Allow                  -> ImplicitDeny
 *   7. Còn lại                                                          -> Allow
 *
 * Hỗ trợ: Action/NotAction, Resource/NotResource, Principal, ký tự đại diện * và ?,
 * biến chính sách ${aws:username}..., các toán tử điều kiện phổ biến, hậu tố IfExists,
 * tiền tố ForAnyValue:/ForAllValues:.
 */

function escapeRegex(s) {
  return s.replace(/[.+^${}()|[\]\\]/g, '\\$&');
}

function wildcardMatch(pattern, value, ignoreCase) {
  if (typeof pattern !== 'string' || typeof value !== 'string') return false;
  const re = '^' + escapeRegex(pattern).replace(/\*/g, '.*').replace(/\?/g, '.') + '$';
  return new RegExp(re, ignoreCase ? 'i' : '').test(value);
}

function toArray(v) {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function lookup(context, key) {
  const lower = key.toLowerCase();
  for (const k of Object.keys(context || {})) {
    if (k.toLowerCase() === lower) return context[k];
  }
  return undefined;
}

function substitute(str, context) {
  if (typeof str !== 'string') return str;
  return str.replace(/\$\{([^}]+)\}/g, (_, key) => {
    const v = lookup(context, key);
    // Biến không tồn tại -> không khớp được gì (AWS cũng không khớp)
    return v === undefined ? '\u0000MISSING\u0000' : String(v);
  });
}

function ipToInt(ip) {
  return ip.split('.').reduce((acc, oct) => (acc << 8) + parseInt(oct, 10), 0) >>> 0;
}

function ipInCidr(ip, cidr) {
  const [net, bitsStr] = cidr.split('/');
  const bits = bitsStr === undefined ? 32 : parseInt(bitsStr, 10);
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipToInt(ip) & mask) === (ipToInt(net) & mask);
}

// So khớp MỘT giá trị trong request với MỘT giá trị trong chính sách (toán tử dương)
const BASE_MATCHERS = {
  StringEquals: (c, p) => String(c) === p,
  StringEqualsIgnoreCase: (c, p) => String(c).toLowerCase() === p.toLowerCase(),
  StringLike: (c, p) => wildcardMatch(p, String(c), false),
  ArnEquals: (c, p) => wildcardMatch(p, String(c), false),
  ArnLike: (c, p) => wildcardMatch(p, String(c), false),
  Bool: (c, p) => String(c).toLowerCase() === String(p).toLowerCase(),
  NumericEquals: (c, p) => Number(c) === Number(p),
  NumericLessThan: (c, p) => Number(c) < Number(p),
  NumericLessThanEquals: (c, p) => Number(c) <= Number(p),
  NumericGreaterThan: (c, p) => Number(c) > Number(p),
  NumericGreaterThanEquals: (c, p) => Number(c) >= Number(p),
  DateEquals: (c, p) => Date.parse(c) === Date.parse(p),
  DateLessThan: (c, p) => Date.parse(c) < Date.parse(p),
  DateLessThanEquals: (c, p) => Date.parse(c) <= Date.parse(p),
  DateGreaterThan: (c, p) => Date.parse(c) > Date.parse(p),
  DateGreaterThanEquals: (c, p) => Date.parse(c) >= Date.parse(p),
  IpAddress: (c, p) => ipInCidr(String(c), p),
};

const NEGATED = {
  StringNotEquals: 'StringEquals',
  StringNotEqualsIgnoreCase: 'StringEqualsIgnoreCase',
  StringNotLike: 'StringLike',
  ArnNotEquals: 'ArnEquals',
  ArnNotLike: 'ArnLike',
  NumericNotEquals: 'NumericEquals',
  DateNotEquals: 'DateEquals',
  NotIpAddress: 'IpAddress',
};

function evalCondition(operatorFull, key, policyValues, context) {
  let op = operatorFull;
  let setOp = null;
  if (op.startsWith('ForAnyValue:')) { setOp = 'any'; op = op.slice(12); }
  else if (op.startsWith('ForAllValues:')) { setOp = 'all'; op = op.slice(13); }
  let ifExists = false;
  if (op.endsWith('IfExists')) { ifExists = true; op = op.slice(0, -8); }

  const raw = lookup(context, key);
  const pValues = toArray(policyValues).map((v) => substitute(String(v), context));

  if (op === 'Null') {
    const isNull = raw === undefined;
    return pValues.some((p) => (p.toLowerCase() === 'true') === isNull);
  }

  const negated = Object.prototype.hasOwnProperty.call(NEGATED, op);
  const baseOp = negated ? NEGATED[op] : op;
  const matcher = BASE_MATCHERS[baseOp];
  if (!matcher) throw new Error('Toán tử điều kiện chưa hỗ trợ: ' + operatorFull);

  if (raw === undefined) {
    if (ifExists) return true;
    if (setOp === 'all') return true;
    if (setOp === 'any') return false;
    return negated; // toán tử phủ định trả về true khi khoá không có trong request
  }

  const cValues = toArray(raw);
  const matchOne = (c) => pValues.some((p) => matcher(c, p));

  if (setOp === 'any') {
    const hit = cValues.some(matchOne);
    return negated ? cValues.some((c) => !matchOne(c)) : hit;
  }
  if (setOp === 'all') {
    return negated ? cValues.every((c) => !matchOne(c)) : cValues.every(matchOne);
  }
  const hit = cValues.some(matchOne);
  return negated ? !hit : hit;
}

function conditionsMatch(condition, context) {
  if (!condition) return true;
  for (const [op, block] of Object.entries(condition)) {
    for (const [key, values] of Object.entries(block)) {
      if (!evalCondition(op, key, values, context)) return false;
    }
  }
  return true;
}

function actionMatches(stmt, action) {
  if (stmt.Action !== undefined) return toArray(stmt.Action).some((a) => wildcardMatch(a, action, true));
  if (stmt.NotAction !== undefined) return !toArray(stmt.NotAction).some((a) => wildcardMatch(a, action, true));
  return false;
}

function resourceMatches(stmt, resource, context) {
  // Trust policy / resource policy có thể không có Resource
  if (stmt.Resource === undefined && stmt.NotResource === undefined) return true;
  if (stmt.Resource !== undefined) {
    return toArray(stmt.Resource).some((r) => wildcardMatch(substitute(r, context), resource, false));
  }
  return !toArray(stmt.NotResource).some((r) => wildcardMatch(substitute(r, context), resource, false));
}

function principalMatches(stmt, principal) {
  if (stmt.Principal === undefined) return true; // identity policy
  if (stmt.Principal === '*') return true;
  if (!principal) return false;
  return Object.entries(stmt.Principal).some(([type, values]) =>
    toArray(values).some((v) => {
      if (v === '*') return true;
      if (type === 'AWS' && /^\d{12}$/.test(v)) {
        return principal.startsWith(`arn:aws:iam::${v}:`) || principal.startsWith(`arn:aws:sts::${v}:`);
      }
      if (type === 'AWS' && /^arn:aws:iam::\d{12}:root$/.test(v)) {
        const acct = v.split(':')[4];
        return principal.startsWith(`arn:aws:iam::${acct}:`) || principal.startsWith(`arn:aws:sts::${acct}:`);
      }
      return wildcardMatch(v, principal, false);
    })
  );
}

function matchingStatements(policyDoc, req, effect) {
  const out = [];
  toArray(policyDoc.Statement).forEach((stmt, i) => {
    if (stmt.Effect !== effect) return;
    if (!principalMatches(stmt, req.principal)) return;
    if (!actionMatches(stmt, req.action)) return;
    if (!resourceMatches(stmt, req.resource, req.context)) return;
    if (!conditionsMatch(stmt.Condition, req.context)) return;
    out.push(stmt.Sid || `Statement[${i}]`);
  });
  return out;
}

/**
 * @param {object} policies
 *   identity:  [{name, doc}]  – chính sách gắn vào user/group/role
 *   resource:  [{name, doc}]  – bucket policy, trust policy...
 *   scps:      [{name, doc}]
 *   boundary:  {name, doc} | undefined
 *   session:   {name, doc} | undefined
 * @param {object} req  {principal, action, resource, context}
 */
function evaluate(policies, req) {
  const identity = policies.identity || [];
  const resource = policies.resource || [];
  const scps = policies.scps || [];
  const boundary = policies.boundary ? [policies.boundary] : [];
  const session = policies.session ? [policies.session] : [];
  const all = [
    ...scps.map((p) => ({ ...p, kind: 'SCP' })),
    ...identity.map((p) => ({ ...p, kind: 'identity' })),
    ...resource.map((p) => ({ ...p, kind: 'resource' })),
    ...boundary.map((p) => ({ ...p, kind: 'boundary' })),
    ...session.map((p) => ({ ...p, kind: 'session' })),
  ];
  const ctx = req.context || {};
  const r = { ...req, context: ctx };

  const denies = [];
  for (const p of all) {
    for (const sid of matchingStatements(p.doc, r, 'Deny')) denies.push(`${p.kind}:${p.name}#${sid}`);
  }
  if (denies.length) return { decision: 'ExplicitDeny', by: denies };

  const allowsIn = (list, kind) => {
    const hits = [];
    for (const p of list) for (const sid of matchingStatements(p.doc, r, 'Allow')) hits.push(`${kind}:${p.name}#${sid}`);
    return hits;
  };

  if (scps.length) {
    const scpAllow = allowsIn(scps, 'SCP');
    if (!scpAllow.length) return { decision: 'ImplicitDeny', by: ['SCP không cho phép'] };
  }

  const resAllow = allowsIn(resource, 'resource');
  const idAllow = allowsIn(identity, 'identity');

  if (!idAllow.length && !resAllow.length) {
    return { decision: 'ImplicitDeny', by: ['không có chính sách nào Allow'] };
  }
  if (idAllow.length && boundary.length && !allowsIn(boundary, 'boundary').length && !resAllow.length) {
    return { decision: 'ImplicitDeny', by: ['permissions boundary không cho phép'] };
  }
  if (session.length && !allowsIn(session, 'session').length) {
    return { decision: 'ImplicitDeny', by: ['session policy không cho phép'] };
  }
  return { decision: 'Allow', by: [...idAllow, ...resAllow] };
}

function short(decision) {
  return decision === 'Allow' ? 'ALLOW' : decision === 'ExplicitDeny' ? 'DENY (tường minh)' : 'DENY (ngầm định)';
}

module.exports = { evaluate, wildcardMatch, short };
