# [Bai tap - Xuat sac] Vong doi Token & API Refresh Token

## Muc tieu
Quan ly trang thai dang nhap lien tuc ma khong bat nguoi dung phai dang nhap lai nhieu lan, tang cuong UX.

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

**Buoc 1 — Login:**
```
POST http://localhost:3000/api/auth/login
Body (JSON): { "username": "hungpv", "password": "123456" }
```
Ket qua tra ve:
```json
{
  "status": 200,
  "message": "LOGIN_SUCCESS",
  "data": {
    "accessToken": "Bearer eyJ...",
    "refreshToken": "Bearer eyJ..."
  }
}
```

**Buoc 2 — Dung refreshToken de xin Access Token moi:**
```
POST http://localhost:3000/api/auth/refresh-token
Body (JSON): { "refreshToken": "Bearer <refreshToken vua nhan o Buoc 1>" }
```
Ket qua:
```json
{
  "status": 200,
  "message": "SUCCESS",
  "data": { "accessToken": "Bearer eyJ... (token moi hoan toan)" }
}
```

**Buoc 3 — Test voi refreshToken SAI / gia:**
```
POST http://localhost:3000/api/auth/refresh-token
Body (JSON): { "refreshToken": "Bearer token.gia.mao" }
```
-> `401 { "message": "INVALID_REFRESH_TOKEN" }`

## Logic chinh (dung endpoint POST /api/auth/refresh-token)
File `src/controllers/authController.js` ham `refreshToken`:
1. Xac thuc chu ky cua Refresh Token (`verifyRefreshToken`)
2. Truy van "DB" (`isRefreshTokenValid`) de dam bao token nay chua bi huy
3. Neu chuan xac -> Ky (sign) mot Access Token hoan toan moi (`generateAccessToken`)

## Ghi chu
- Du lieu user va refresh token luu **trong bo nho (in-memory array)** trong `src/utils/db.js`, chi phuc vu bai tap. Restart server se mat cac refreshToken da cap, phai login lai.
- Access Token song 15 phut, Refresh Token song 7 ngay (co the chinh trong file `.env`).
