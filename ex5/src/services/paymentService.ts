import { payments, type Payment } from "../data/mockDb.ts";

const rate = (failed: number, total: number) => (total === 0 ? 0 : Math.round((failed / total) * 1000) / 1000);

export function paymentsBetween(from: Date, to: Date): Payment[] {
  return payments.filter((p) => p.createdAt >= from && p.createdAt < to);
}

// Thong ke thanh toan loi theo cong thanh toan va ma loi
export function getPaymentFailures(from: Date, to: Date) {
  const list = paymentsBetween(from, to);
  const byGateway: Record<string, { total: number; failed: number; failureRate: number; errors: Record<string, number>; firstFailure?: string; lastFailure?: string }> = {};

  for (const p of list) {
    const g = (byGateway[p.gateway] ??= { total: 0, failed: 0, failureRate: 0, errors: {} });
    g.total++;
    if (!p.success) {
      g.failed++;
      g.errors[p.errorCode ?? "UNKNOWN"] = (g.errors[p.errorCode ?? "UNKNOWN"] ?? 0) + 1;
      const time = p.createdAt.toISOString();
      g.firstFailure = g.firstFailure && g.firstFailure < time ? g.firstFailure : time;
      g.lastFailure = g.lastFailure && g.lastFailure > time ? g.lastFailure : time;
    }
  }
  for (const g of Object.values(byGateway)) g.failureRate = rate(g.failed, g.total);

  const failed = list.filter((p) => !p.success).length;
  return { total: list.length, failed, failureRate: rate(failed, list.length), byGateway };
}
