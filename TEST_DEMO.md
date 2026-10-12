# Checklist demo thật – Đề 28 PetShop

**Không đánh dấu thành công trước khi trực tiếp chạy trên host có Docker.** Mục tiêu: bằng chứng cho tất cả 7 tiêu chí trong đề bài (website/DB, Nginx, Prometheus/Grafana, Loki/LogQL, hardening, GitHub/README và tổng thể).

## 1. Chuẩn bị đúng phiên bản

```bash
git rev-parse --short HEAD
docker compose config -q
docker compose up -d --build
docker compose ps
docker compose logs --tail 80 db webapp nginx loki grafana
```

- [ ] Ghi nhận commit đang chạy. Chỉ service có healthcheck mới thể hiện `healthy`; các service khác thường hiển thị `running`.
- [ ] Nếu DB từng chạy với volume cũ, xem cảnh báo migration trong README. Không reset hoặc xóa volume chứa dữ liệu thật.

## 2. Website, CRUD, DB

- [ ] Truy cập https://localhost, đăng nhập bằng ADMIN_USER / ADMIN_PASSWORD trong .env. Không đưa mật khẩu vào ảnh.
- [ ] Thêm/sửa/xóa một khách, pet, dịch vụ, lịch hẹn; kiểm tra trường hợp thú cưng có chủ khác.
- [ ] Chạy `./tests/smoke_api.sh` trên host Linux/WSL (cần bash, curl, python3, GNU date).
- [ ] Vào pgAdmin http://localhost:5050, kết nối DB host `db`, mở bảng `customers,pets,services,appointments`.
- [ ] Chụp trang Tổng quan, quản lý thú cưng, pgAdmin hiển thị đủ bảng.

## 3. HTTPS, reverse proxy, network, hardening

```bash
curl -skI http://localhost
curl -skI https://localhost | grep -Ei 'HTTP/|x-frame-options|x-content-type-options|strict-transport-security|content-security-policy'
curl -sk -o /dev/null -w '%{http_code}\n' https://localhost/metrics
stat -c '%a %n' nginx/certs/server.key
docker compose exec webapp id
docker compose exec nginx id
docker compose exec webapp sh -c 'touch /usr/src/app/should-fail'  # mong đợi fail: read-only
docker compose exec db sh -c 'pg_isready -U postgres -d "$POSTGRES_DB"'
```

- [ ] Quan sát 80→443, headers, 404 cho metrics công khai, TLS key mode 600, user non-root.
- [ ] Chụp Docker Compose PS, curl HTTPS/headers, lệnh kiểm chứng quyền; **không** tuyên bố mọi container non-root do cAdvisor đặc quyền.

## 4. Metrics

- [ ] Trong Prometheus http://localhost:9090/targets: xác minh `prometheus`, `webapp`, `cadvisor`, `nginx`, `postgres` UP. Nếu DOWN thì ghi và sửa.
- [ ] Trong Grafana http://localhost:3000 → dashboards → PetShop: CPU, RAM, Nginx, PostgreSQL và metric thất bại đăng nhập có dữ liệu thực.
- [ ] Chụp Targets và dashboard (thấy nhãn/thời gian).

## 5. Loki, LogQL, alert

- [ ] Grafana → Explore → Loki: thực hiện ít nhất 3 query có kết quả/ý nghĩa. Ví dụ:

```logql
{job="webapp"} |= "LOGIN_FAILED"
{job="webapp"} |~ "(ERROR|Exception|Failed)"
{job="nginx"} |~ "\\" 5[0-9]{2} "
```

- [ ] `./scripts/attack-sim.sh https://localhost` → xem log LOGIN_FAILED trong Loki.
- [ ] Kiểm tra Grafana Alerting rule `Brute-force đăng nhập`. Nếu Firing, chụp thời gian và trạng thái.
- [ ] Kiểm tra log `ALERT_RECEIVED` từ `docker compose logs webapp`. Nếu chưa nhận, không ghi webhook thành công.

## 6. Ghép vào Word

- [ ] Chụp đủ: GitHub/commit/README, Docker ps, CRUD, pgAdmin, HTTP headers, Prometheus Targets, Grafana dashboard, 3 LogQL, rule Firing (nếu thật), hardening.
- [ ] Trong báo cáo thay toàn bộ **[CẦN ẢNH THỰC TẾ]** bằng ảnh thật ở cùng vị trí; tránh lộ thông tin .env.
- [ ] Báo cáo phải khớp đúng commit triển khai và chỉ dùng các từ “đã chạy”, “đạt”, “Firing” khi có ảnh/kiểm thử.
