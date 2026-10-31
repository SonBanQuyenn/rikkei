#!/usr/bin/env bash
# Demo 1 - Trien khai thanh cong: thay doi nho, co kiem thu -> qua 6 giai doan, len production
# Chay tu thu muc goc repo ShopFast API (thu muc ex5).
set -euo pipefail

git checkout main && git pull
git checkout -b demo/thanh-cong

# Them san pham moi (co san test bao phu route /products)
sed -i "s|{ id: 2, name: 'Mu luoi trai', price: 90000 },|{ id: 2, name: 'Mu luoi trai', price: 90000 },\n  { id: 3, name: 'Tui tote', price: 120000 },|" src/app.ts
sed -i 's/expect(res.body).toHaveLength(2);/expect(res.body).toHaveLength(3);/' test/app.test.ts

git commit -am "feat: them san pham Tui tote"
git push -u origin demo/thanh-cong
gh pr create --base main --title "Demo 1: trien khai thanh cong" --body "validate, test, security, build xanh"

echo "Cho 4 check xanh roi merge:"
echo "  gh pr checks --watch && gh pr merge --squash"
echo "Ket qua mong doi tren main: staging va production deu 'DAT: phien ban <sha> on dinh'"
