# [Bai tap - Gioi] Middleware Chot chan (Authentication)

## Muc tieu
Xac minh danh tinh nguoi dung (token hop le hay khong) truoc khi cho phep truy cap tai nguyen (Controller).

## Cai dat & chay
```bash
npm install
npm run dev     # hoac: npm start
```
Server chay tai `http://localhost:3000`

## Tai khoan test
| username | password |
|----------|----------|
| hungpv   | 123456   |
| admin    | admin123 |

## Cac buoc test bang Postman

**Buoc 1 — Lay token de test:**
```
POST http://localhost:3000/api/auth/login
Body (JSON): { "username": "hungpv", "password": "123456" }
```
-> nhan ve `data.token`, dang `Bearer eyJ...`

**Buoc 2 — Goi API duoc bao ve, KHONG gan token:**
```
GET http://localhost:3000/api/users
```
-> `401 { "status": 401, "message": "TOKEN_REQUIRED" }`

**Buoc 3 — Goi API voi token SAI:**
```
GET http://localhost:3000/api/users
Header: Authorization: Bearer token.sai.roi
```
-> `401 { "status": 401, "message": "INVALID_TOKEN" }`

**Buoc 4 — Goi API voi token DUNG (lay o Buoc 1):**
```
GET http://localhost:3000/api/users
Header: Authorization: Bearer <token>
```
-> `200`, tra ve danh sach user

## Trong tam bai tap
File `src/middlewares/authMiddleware.js` — day la phan chinh can quan tam:
- Boc tach token tu header `Authorization`
- Verify chu ky + han su dung
- Sai/het han -> chan lai, tra 401
- Dung -> giai ma, gan `req.user`, goi `next()` de di tiep vao Controller
