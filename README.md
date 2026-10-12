# 🐾 Hệ thống Quản lý Cửa hàng Thú cưng

**Sinh viên:** Vũ Hiếu Kiên · **MSSV:** DTC245200244 · **Lớp:** CNTT K23C · **GVHD:** Vũ Việt Dũng · **Trường:** ĐH Công nghệ Thông tin và Truyền thông (ICTU)
**Môn:** Triển khai và Quản trị Hệ thống Phần mềm – **Đề 28**

Website quản lý thú cưng, dịch vụ spa, khách hàng, lịch hẹn, triển khai hoàn toàn bằng Docker Compose.

## Kiến trúc

```
Internet ─▶ Nginx (80/443, HTTPS tự ký, security headers, rate-limit login)
              │  mạng "frontend"
              ▼
           webapp (Node.js, non-root) ──mạng "backend" (internal)──▶ PostgreSQL ◀── pgAdmin
                                                                         │
   mạng "monitoring": Prometheus ◀── cAdvisor, nginx-exporter, postgres-exporter, webapp /metrics
                      Grafana (dashboard + Alerting) ◀── Prometheus, Loki
                      Promtail (docker.sock) ──▶ Loki
```

| Thành phần | Truy cập |
|---|---|
| Website | https://localhost (HTTP tự chuyển sang HTTPS) |
| pgAdmin | http://localhost:5050 |
| Grafana | http://localhost:3000 |
| Prometheus | http://localhost:9090 |

pgAdmin, Grafana, Prometheus chỉ bind vào `127.0.0.1`. Tài khoản/mật khẩu nằm trong file `.env`.

## Chạy hệ thống

```bash
git clone <URL repo> && cd petshop
./scripts/gen-env.sh       # tạo .env với mật khẩu mạnh ngẫu nhiên (xem mật khẩu trong file .env)
./scripts/gen-cert.sh      # tạo chứng chỉ HTTPS tự ký
docker compose up -d --build
docker compose ps
```
Kết nối pgAdmin tới server: host `db`, port `5432`, user/password lấy từ `DB_USER`, `DB_PASSWORD` trong `.env`.

## Lịch sử 3 commit
1. **Commit 1** – web + PostgreSQL + pgAdmin + Nginx reverse proxy (HTTPS tự ký, security headers)
2. **Commit 2** – Prometheus + Grafana (cAdvisor, nginx-exporter, postgres-exporter, dashboard)
3. **Commit 3** – Loki + Promtail + LogQL, Grafana Alerting, hardening

## Log tập trung (LogQL)
Vào Grafana → Explore → datasource **Loki**:
```logql
{job="nginx"} |~ "\" 5[0-9]{2} "                         # lỗi HTTP 5xx từ Nginx
{job="webapp"} |~ "(ERROR|Exception|Failed)"              # lỗi trong ứng dụng
{job="webapp"} |= "LOGIN_FAILED"                          # đăng nhập thất bại
sum by (ip) (count_over_time({job="webapp"} |= "LOGIN_FAILED" | regexp `ip=(?P<ip>\S+)` [5m]))   # đếm theo IP
```

## Kịch bản sự cố an toàn thông tin (brute-force) → cảnh báo → truy vết
1. Chạy `./scripts/attack-sim.sh https://localhost` (30 lần đăng nhập sai liên tiếp).
2. Webapp ghi log `level=WARN event=LOGIN_FAILED user=admin ip=...`; Promtail đẩy về Loki; metric `petshop_login_failed_total` tăng (xem trên dashboard).
3. Quy tắc Grafana Alerting `Brute-force đăng nhập` (>5 lần/1 phút) chuyển sang **Firing**, gửi webhook tới `webapp:/internal/alert`.
4. Truy vết: `{job="webapp"} |~ "LOGIN_FAILED|ALERT_RECEIVED"` cho thấy IP nguồn, thời điểm, và dòng `ALERT_RECEIVED`; `{job="nginx"} |= "POST /api/login"` cho thấy request tương ứng ở Nginx.

## Hardening đã áp dụng
- Container non-root: `webapp` (user `node`), `nginx` (nginx-unprivileged), PostgreSQL/Grafana/Prometheus/Loki chạy bằng user riêng của image.
- Network isolation: mạng `backend` là `internal: true`, DB không có đường ra/vào từ ngoài; DB không publish port.
- Mật khẩu mạnh sinh ngẫu nhiên, lưu ở `.env` (quyền 600, đã `.gitignore`); không hard-code trong mã nguồn.
- `read_only` filesystem, `cap_drop: ALL`, `no-new-privileges` cho webapp và nginx.
- Nginx: security headers theo OWASP Secure Headers Project (X-Frame-Options, X-Content-Type-Options, `X-XSS-Protection: 0`, HSTS, CSP chặt không dùng `unsafe-inline`, Referrer-Policy, Permissions-Policy, COOP/CORP), ẩn phiên bản, TLS 1.2/1.3 với bộ mã hóa "Intermediate" của Mozilla, rate-limit trang đăng nhập, chặn `/metrics` và `/internal`.
- Image build bằng `npm ci` (khóa phiên bản qua `package-lock.json`).

## Giao diện (Design System)
Giao diện tiếng Việt, không phụ thuộc CDN. Dùng design tokens (màu, khoảng cách 4/8px, bo góc, cỡ chữ), màu chữ đạt tỷ lệ tương phản WCAG 2.2 AA (≥ 4.5:1), icon SVG, trạng thái focus rõ ràng, điều hướng bằng bàn phím, hộp thoại xác nhận khi xóa, responsive cho điện thoại.
