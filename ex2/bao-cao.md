# Bài tập 6 – Điền khuyết cơ chế kết nối lại cho ứng dụng giao hàng

| File | Nội dung |
|---|---|
| `src/driver-client.ts` | Client của tài xế – chỗ khuyết (1)–(4) |
| `src/server/driver.gateway.ts` | Phía server – chỗ khuyết (5), xác thực token, đăng ký room khu vực, trạng thái online |
| `src/demo.ts` | Kịch bản chạy thử: ngắt mạng giữa chừng → bật lại; mạng chập chờn 10 lần/30 giây |
| `logs/reconnect-run.log` | Log thật của một lần chạy `npm run demo` |
| `test/reconnect.test.ts` | Kiểm thử tự động (`npm test`) |

## 5 chỗ khuyết đã điền

| # | Chỗ khuyết | Cách điền |
|---|---|---|
| (1) | Tự động kết nối lại | `reconnection: true` |
| (2) | Giới hạn số lần + giãn dần thời gian chờ | `reconnectionAttempts: 10`, `reconnectionDelay: 1000`, `reconnectionDelayMax: 10000`, `randomizationFactor: 0.5` → chờ 1s, 2s, 4s, 8s, 10s… mỗi lần lệch ngẫu nhiên ±50%. Hết 10 lần thì nghỉ 60s rồi **tự** bắt đầu đợt mới (`reconnect_failed` → `socket.connect()`) để tài xế không phải thao tác gì |
| (3) | Đăng ký lại room sau khi nối lại | Trong `on('connect')` luôn gửi `driver:join_zones` – mỗi lần nối lại server tạo socket mới, room cũ đã mất khi disconnect |
| (4) | Báo mất kết nối cho tài xế | `disconnect`, `reconnect_attempt`, `reconnect_failed`, `connect_error` → `onStatus` → `describeStatus()` hiện “Mất kết nối – đang tự kết nối lại…”, “Đang kết nối lại (lần n)”, “Tự thử lại sau 60s”. Sai token thì tắt reconnection và yêu cầu đăng nhập lại |
| (5) | Ngưỡng chờ phía server | `pingInterval: 10000`, `pingTimeout: 5000` → máy tắt/mất sóng bị phát hiện sau tối đa ~15s, `handleDisconnect` gỡ tài xế khỏi danh sách online (sửa lỗi “tắt máy lâu vẫn online”) |

## Bẫy dữ liệu: mạng chập chờn 10 lần trong 30 giây

- **Exponential backoff**: thời gian chờ nhân đôi sau mỗi lần thất bại, chặn trần 10s → một thiết bị không thể gửi dồn dập.
- **Jitter (`randomizationFactor`)**: khi trạm phát sóng/server sập rồi sống lại, hàng nghìn tài xế không nối lại cùng một mili-giây.
- **Giới hạn số lần + cooldown 60s**: nếu server sập lâu, mỗi thiết bị chỉ thử tối đa 10 lần/đợt rồi nghỉ.
- Backoff được Socket.IO đặt lại sau mỗi lần nối lại thành công nên ra khỏi hầm là nối lại nhanh.
- Sai token (`UNAUTHORIZED`) thì dừng hẳn, không thử lại vô ích.

Kết quả đo trong `logs/reconnect-run.log`: trong pha chập chờn 10 lần/30 giây, app chỉ thử nối lại **14 lần**, server chỉ nhận **7 lần bắt tay** cho cả buổi chạy. Test `mang chap chon 10 lan` chạy với 20 thiết bị cũng xác nhận số lần bắt tay bị chặn trên.

## Log chạy thử – chuỗi mất kết nối và nối lại thành công

Trích từ `logs/reconnect-run.log` (mất kết nối được giả lập bằng cách tắt server/mạng 8 giây):

```
[+  0.3s] SERVER TX01 ONLINE (socket qwKiz4samb5M6PrIAAAA)
[+  0.3s] APP    Dang truc tuyen - san sang nhan don
[+  0.3s] SERVER TX01 dang ky khu vuc: Q1, Q3
[+  1.8s] APP    >>> NHAN DON MOI DH-1001 (khu vuc Q1)
[+  2.8s] SERVER TX01 OFFLINE (0 thiet bi con lai)
[+  2.8s] NET    === MAT KET NOI (tat server / mat song) ===
[+  2.8s] APP    Mat ket noi (transport close) - dang tu ket noi lai...
[+  3.7s] APP    Dang ket noi lai (lan 1)...
[+  5.0s] APP    Dang ket noi lai (lan 2)...
[+  7.7s] APP    Dang ket noi lai (lan 3)...
[+ 10.8s] NET    === server/mang hoat dong ===
[+ 17.7s] APP    Dang ket noi lai (lan 4)...
[+ 17.7s] SERVER TX01 ONLINE (socket xeDJwji7jOutY7vcAAAB)
[+ 17.7s] APP    Dang truc tuyen - san sang nhan don
[+ 17.7s] SERVER TX01 dang ky khu vuc: Q1, Q3        <- (3) tu dang ky lai room
[+ 18.2s] APP    >>> NHAN DON MOI DH-1002 (khu vuc Q3) <- van nhan don sau khi noi lai
```

Khoảng cách giữa các lần thử 0.9s → 1.3s → 2.7s → 10s cho thấy thời gian chờ giãn dần.

## Chạy

```
npm install
npm test        # 4/4 pass
npm run demo    # ~55s, ghi lai logs/reconnect-run.log
npm start       # chi chay server o cong 3000
```
