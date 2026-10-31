import { Metrics } from '../src/metrics';
import { signToken, verifyToken } from '../src/token';

describe('Metrics', () => {
  it('tinh p95 va dem loi 5xx', () => {
    const m = new Metrics();
    expect(m.p95()).toBe(0);
    for (let i = 1; i <= 100; i++) m.record(i === 100 ? 500 : 200, i);
    expect(m.snapshot()).toEqual({ requestsTotal: 100, errors5xxTotal: 1, latencyP95Ms: 95 });
  });

  it('chi giu cua so N request gan nhat', () => {
    const m = new Metrics(2);
    m.record(200, 1000);
    m.record(200, 1);
    m.record(200, 2);
    expect(m.p95()).toBe(2);
  });
});

describe('token', () => {
  const now = Date.UTC(2026, 9, 31);

  it('ky va xac thuc dung', () => {
    expect(verifyToken(signToken('u1', 's', 60, now), 's', now)).toBe('u1');
  });

  it('tu choi token sai secret, sai dinh dang, het han', () => {
    const token = signToken('u1', 's', 60, now);
    expect(verifyToken(token, 'khac', now)).toBeNull();
    expect(verifyToken('abc', 's', now)).toBeNull();
    expect(verifyToken(token, 's', now + 61_000)).toBeNull();
  });
});
