#!/usr/bin/env bash
# Demo 2 - Bi cong kiem soat chat luong chan:
#   (a) them code khong co kiem thu -> do phu < 80% -> job "test" do
#   (b) them phu thuoc co lo hong high -> job "security" do
# PR khong merge duoc, khong co image nao duoc build/day.
set -euo pipefail

git checkout main && git pull
git checkout -b demo/bi-chan

cat > src/coupon.ts <<'EOF'
// Tinh nang moi nhung KHONG co kiem thu
export function applyCoupon(total: number, code: string): number {
  if (code === 'FREESHIP') return total;
  if (code === 'SALE10') return Math.round(total * 0.9);
  if (code === 'SALE20') return Math.round(total * 0.8);
  if (code === 'VIP') {
    if (total > 1_000_000) return total - 200_000;
    if (total > 500_000) return total - 100_000;
    return total - 50_000;
  }
  if (code.startsWith('GIFT-')) {
    const amount = Number(code.slice(5));
    if (Number.isNaN(amount)) throw new Error('Ma qua tang khong hop le');
    return Math.max(0, total - amount);
  }
  throw new Error('Ma giam gia khong ton tai');
}
EOF
npx prettier --write src/coupon.ts
npm install lodash@4.17.20

git add -A
git commit -m "feat: ma giam gia (chua co test) + lodash"
git push -u origin demo/bi-chan
gh pr create --base main --title "Demo 2: bi cong kiem soat chan" --body "Mong doi: test va security do, build bi bo qua"

echo "Ket qua mong doi:"
echo "  test     : Jest: \"global\" coverage threshold for lines (80%) not met"
echo "  security : lodash <=4.17.23 Severity: high -> npm audit exit 1"
echo "  build    : skipped, nut Merge bi khoa"
