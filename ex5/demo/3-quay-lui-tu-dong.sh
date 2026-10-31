#!/usr/bin/env bash
# Demo 3 - Quay lui tu dong: loi chi lo ra khi chay that (unit test van xanh).
# /products/:id nem loi -> 500 cho moi san pham ton tai.
# verify.sh tren staging do ti le loi probe 50% > 5% -> deploy.sh tu dong quay lui
# ve phien ban truoc (ma thoat 2), giai doan production khong chay.
set -euo pipefail

git checkout main && git pull
git checkout -b demo/quay-lui

# Loi chi xay ra khi bien moi truong production duoc bat (test chay NODE_ENV=test nen khong thay)
sed -i "s|const product = products.find((p) => p.id === Number(req.params.id));|const product = products.find((p) => p.id === Number(req.params.id));\n    if (product \&\& process.env.NODE_ENV === 'production') throw new Error('bug chi co tren production');|" src/app.ts
npx prettier --write src/app.ts

git commit -am "refactor: tim san pham theo id"
git push -u origin demo/quay-lui
gh pr create --base main --title "Demo 3: quay lui tu dong" --body "CI xanh nhung loi khi chay that"

echo "Merge khi CI xanh: gh pr checks --watch && gh pr merge --squash"
echo "Ket qua mong doi o job deploy-staging:"
echo "  [verify] THAT BAI: ti le loi probe 50% > 5%"
echo "  [deploy] TU DONG QUAY LUI ve <sha truoc>"
echo "  ::error::Verify that bai - da TU DONG QUAY LUI ve phien ban truoc"
echo "Sau do revert commit tren main: git revert <sha> && git push"
