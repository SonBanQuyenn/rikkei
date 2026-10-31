# Bài tập 5 – Vá lỗi image 1,4 GB và lộ khoá bí mật

Môi trường đo: Docker Desktop 29.4.3 (BuildKit), Windows 11, image nền `node:20` (Node 20.20.2).
Toàn bộ số liệu bên dưới lấy từ log thật trong thư mục `logs/`.

| File | Nội dung |
|---|---|
| `Dockerfile.old` | Dockerfile hiện trường (giữ nguyên để đối chứng) |
| `Dockerfile` | Dockerfile đã sửa |
| `.dockerignore` | Loại bỏ file không cần khỏi build context |
| `logs/*.log` | Bằng chứng đo được |

---

## Phần 1 – Chỉ ra lỗi bằng dữ liệu

### Khiếm khuyết 1 – Image nền đầy đủ `node:20` + để nguyên mọi thứ trong một tầng → image 1,71 GB

`FROM node:20` là bản Debian đầy đủ (gcc, python, git, header biên dịch…). Không có multi-stage nên mọi thứ dùng để build đều nằm lại trong image chạy.

Bằng chứng (`logs/evidence-new.log`, `docker history shopfast:old`):

```
IMAGE          DISK USAGE   CONTENT SIZE
shopfast:old       1.71GB          425MB     <- Dockerfile cũ
shopfast:new        200MB         49.2MB     <- Dockerfile mới
```

Các tầng lớn nhất của image cũ đều đến từ image nền, không phải từ ứng dụng:

```
619MB   RUN apt-get update; apt-get install ... (buildpack-deps)
194MB   RUN apt-get update; ...
175MB   RUN ... cài Node
133MB   # debian.sh bookworm
107MB   RUN npm install          <- phụ thuộc của ShopFast (cả dev)
```

Riêng lần kéo image nền lần đầu đã mất **99,1 giây** (`logs/build-old-host-node_modules.log`, bước `#4 DONE 99.1s`) – đây chính là lý do mỗi lần triển khai tốn vài phút chỉ để tải image.

### Khiếm khuyết 2 – Khoá bí mật bị “đóng cứng” vào image bằng `ENV`

`ENV DATABASE_URL=...` và `ENV JWT_SECRET=...` được ghi vào metadata của image. Ai kéo được image là đọc được, kể cả khi sau này ghi đè bằng biến khác.

Bằng chứng (`logs/evidence-old.log`):

```
$ docker history --no-trunc shopfast:old | grep -E "DATABASE_URL|JWT_SECRET"
ENV JWT_SECRET=shopfast-secret-key-2026
ENV DATABASE_URL=postgres://admin:MatKhau123@db:5432/shopfast

$ docker image inspect shopfast:old --format "{{json .Config.Env}}"
[..., "DATABASE_URL=postgres://admin:MatKhau123@db:5432/shopfast","JWT_SECRET=shopfast-secret-key-2026"]
```

BuildKit cũng tự cảnh báo: `SecretsUsedInArgOrEnv: Do not use ARG or ENV instructions for sensitive data (ENV "JWT_SECRET") (line 11)`.

Lưu ý: vì khoá đã nằm trong lịch sử tầng của image công khai nên **phải đổi mật khẩu DB và JWT secret**; sửa Dockerfile thôi là chưa đủ.

### Khiếm khuyết 3 – `COPY . .` không có `.dockerignore` → chép rác của máy dev vào image, thậm chí làm hỏng build

Không có `.dockerignore`, mọi thứ trong thư mục (kể cả `node_modules` của máy dev, `.git`, `.env`, `logs`) đều bị gửi vào build context và chép vào image.

Bằng chứng 1 – build trên máy dev có sẵn `node_modules` (`logs/build-old-host-node_modules.log`):

```
#5 transferring context: 57.71MB 4.7s done        <- gửi 57,7 MB node_modules của Windows
...
/app/node_modules/.bin/tsc: 33: exec: node.exe: not found
ERROR: failed to solve: process "/bin/sh -c npm run build" did not complete successfully: exit code: 127
```

`node_modules` của Windows ghi đè lên môi trường Linux trong container → build **thất bại**.
Với Dockerfile mới + `.dockerignore`, build context chỉ còn **188 B** (`logs/build-new.log`).

Bằng chứng 2 – image cũ chứa cả file không dùng khi chạy (`logs/evidence-old.log`):

```
$ docker run --rm shopfast:old ls /app
Dockerfile.old  dist  logs  node_modules  package-lock.json  package.json  src  tsconfig.json
```

### Khiếm khuyết 4 – Thứ tự lệnh phá bộ nhớ đệm tầng → sửa 1 dòng code là cài lại toàn bộ phụ thuộc

`COPY . .` đứng trước `RUN npm install`, nên bất kỳ thay đổi nào trong mã nguồn cũng làm tầng `COPY` đổi checksum, kéo theo `npm install` chạy lại từ đầu.

Bằng chứng – sửa 1 dòng trong `src/main.ts` rồi build lại:

| | Bước `npm install` / `npm ci` | Tổng thời gian |
|---|---|---|
| Dockerfile cũ (`logs/rebuild-old-after-code-change.log`) | `#8 [4/5] RUN npm install` → **chạy lại, 9.1s** | 18,5 s |
| Dockerfile mới (`logs/rebuild-new-after-code-change.log`) | `#10 [build 4/7] RUN npm ci` → **CACHED** | 8,0 s |

Dự án thật có nhiều phụ thuộc hơn thì chênh lệch còn lớn hơn rất nhiều.

### Khiếm khuyết 5 – Image production chứa mã nguồn TypeScript và phụ thuộc phát triển

`npm install` (không `--omit=dev`) cài cả `typescript`, `jest`, `ts-node-dev`… và `src/*.ts` vẫn nằm trong image.

Bằng chứng (`logs/evidence-old.log`, `logs/evidence-new.log`):

```
$ docker run --rm shopfast:old ls /app/src /app/node_modules/.bin
main.ts  jest  ts-node-dev  tsc  ...
$ docker run --rm shopfast:old du -sh /app
76M  /app

$ docker run --rm shopfast:new ls /app /app/node_modules/.bin
dist  node_modules  package.json  ---  mime
$ docker run --rm shopfast:new du -sh /app
5.5M  /app
```

### Khiếm khuyết 6 – Tiến trình chạy bằng `root`

Không có `USER`, container chạy với quyền quản trị; nếu ứng dụng bị khai thác, kẻ tấn công có root trong container.

```
$ docker run --rm shopfast:old whoami
root
$ docker run --rm shopfast:new whoami
node
```

### Khiếm khuyết 7 – Lệnh khởi chạy dùng chế độ dev (`npm run start:dev`)

Production lại chạy `ts-node-dev --respawn` (biên dịch TypeScript lúc chạy, theo dõi file), bọc qua `npm` và `sh` nên PID 1 là `npm` chứ không phải `node`. Bước `npm run build` tạo ra `dist/` nhưng không hề được dùng.

Bằng chứng (`logs/runtime-compare.log`, cùng một ứng dụng, đã khởi động xong):

```
NAME      MEM USAGE    PIDS
sf-old    238.1MiB     30
sf-new    13.38MiB     7

$ docker top sf-old
root  npm run start:dev
root  sh -c ts-node-dev --respawn src/main.ts
root  node /app/node_modules/.bin/ts-node-dev --respawn src/main.ts
root  /usr/local/bin/node -r /tmp/ts-node-dev-hook-...js .../wrap.js src/main.ts

$ docker top sf-new
1000  node dist/main.js
```

### Tổng hợp trước / sau

| Tiêu chí | Cũ | Mới |
|---|---|---|
| Dung lượng image (disk) | 1,71 GB | 200 MB (≈ giảm 88%) |
| Dung lượng nén khi đẩy/kéo | 425 MB | 49,2 MB |
| Build context | 57,7 MB (có node_modules) | 188 B |
| Rebuild khi sửa 1 dòng code | 18,5 s, cài lại phụ thuộc | 8,0 s, phụ thuộc lấy từ cache |
| Khoá bí mật trong image | Có (`docker history`, `inspect`) | Không |
| Mã nguồn TS + devDependencies | Có (76 MB `/app`) | Không (5,5 MB `/app`) |
| Người dùng chạy tiến trình | root | node (uid 1000) |
| Lệnh chạy | `npm run start:dev` (ts-node-dev) | `node dist/main.js` |
| RAM khi chạy | 238 MiB | 13 MiB |

---

## Phần 2 – Dockerfile đã sửa

Xem `Dockerfile` và `.dockerignore`. Các điểm sửa tương ứng với từng khiếm khuyết:

| Khiếm khuyết | Cách sửa |
|---|---|
| 1. Image nền to | `node:20-alpine` + multi-stage: stage `build` để biên dịch, stage `production` chỉ nhận kết quả |
| 2. Lộ khoá bí mật | Xoá `ENV DATABASE_URL/JWT_SECRET`. Ứng dụng đọc từ biến môi trường **lúc chạy** và dừng ngay nếu thiếu |
| 3. Rác trong context | Thêm `.dockerignore`; chỉ `COPY` đúng file cần (`package*.json`, `tsconfig.json`, `src`) |
| 4. Hỏng cache | `COPY package.json package-lock.json` → `RUN npm ci` **trước**, rồi mới `COPY src` |
| 5. Mã TS + devDeps | `npm prune --omit=dev` sau khi build; stage cuối chỉ copy `node_modules` production và `dist` |
| 6. Chạy root | `USER node`, file được `--chown=node:node` |
| 7. Lệnh chạy dev | `CMD ["node", "dist/main.js"]`, `NODE_ENV=production`, thêm `HEALTHCHECK` |

Cách build và chạy:

```bash
docker build -t shopfast:new .

# Khoá bí mật truyền vào lúc chạy, không nằm trong image
docker run -d -p 3000:3000 --env-file .env.production shopfast:new
# hoặc dùng secret của nền tảng (Kubernetes Secret, Docker Swarm secret, GitHub Actions secrets...)
```

Kiểm tra lại sau khi sửa:

```bash
docker image ls shopfast:new                                            # ~200 MB
docker history --no-trunc shopfast:new | grep -E "JWT_SECRET|MatKhau"   # không có kết quả
docker run --rm --entrypoint whoami shopfast:new                        # node
```
