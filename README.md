# Đề 28: Hệ thống Quản lý Cửa hàng Thú cưng – PetShop

Báo cáo Bài tập lớn học phần **Triển khai và Quản trị Hệ thống Phần mềm** – Khoa Công nghệ Thông tin, Trường Đại học Công nghệ Thông tin và Truyền thông (ICTU).

- **Sinh viên thực hiện:** Vũ Hiếu Kiên
- **Mã số sinh viên (MSSV):** DTC245200244
- **Lớp / Khóa:** CNTT K23C
- **Đề tài:** Đề 28 – Hệ thống Quản lý Cửa hàng Thú cưng (PetShop)

Hệ thống quản lý thú cưng, dịch vụ spa, khách hàng và lịch hẹn được đóng gói toàn bộ bằng **Docker Compose**, bảo vệ bởi **Nginx Reverse Proxy (HTTPS/TLS + Security Headers + Rate Limiting)**, giám sát tài nguyên với **Prometheus + Grafana**, thu thập và truy vấn log tập trung bằng **Loki + Promtail (LogQL)**, tự động phát hiện tấn công dò mật khẩu qua **Grafana Alerting** và áp dụng đầy đủ các biện pháp **Hardening** theo tiêu chuẩn bảo mật.

---

## 1. Sơ đồ kiến trúc tổng thể

```
                         [ Người dùng / Trình duyệt ]
                                  │
                     HTTP :80 ────┼──── HTTPS :443 (TLS 1.2 / 1.3)
                     (301 Redirect)     (HSTS, CSP, Rate Limit 5r/s)
                                  ▼
                ┌──────────────────────────────────┐
                │   nginx (nginx-unprivileged)     │  ◄── stub_status :8081 ──► nginx-exporter :9113
                │   non-root, read_only, cap_drop  │
                └─────────────────┬────────────────┘
                                  │  mạng frontend
                                  ▼
                ┌──────────────────────────────────┐
                │   webapp (Node.js 20 / Express)  │  ◄── /metrics :3000 ─────► prometheus :9090
                │   non-root (node), read_only     │  ◄── /internal/alert ────► grafana :3000
                └─────────────────┬────────────────┘
                                  │  mạng backend (internal: true, cô lập hoàn toàn)
                                  ▼
                ┌──────────────────────────────────┐
                │   db (PostgreSQL 16 Alpine)      │  ◄── pg_monitor ─────────► postgres-exporter :9187
                │   Roles: petshop_app / monitor   │  ◄── quản trị CSDL ──────► pgadmin :5050 (127.0.0.1)
                └──────────────────────────────────┘

   [Docker container logs] ──► promtail ──► loki :3100 ──► grafana :3000 (Explore LogQL & Alerting)
   [Docker cgroups/engine] ──► cadvisor :8080 ───────────► prometheus :9090 ──► grafana :3000
```

### Phân tách mạng Docker (3 vùng mạng độc lập)
| Mạng | Thuộc tính | Các dịch vụ tham gia | Mục đích bảo mật |
|---|---|---|---|
| `frontend` | Bridge | `nginx`, `webapp`, `pgadmin`, `grafana` | Tiếp nhận kết nối qua Reverse Proxy, cách ly hoàn toàn tầng CSDL |
| `backend` | `internal: true` | `db`, `webapp`, `pgadmin`, `postgres-exporter` | Cô lập hoàn toàn PostgreSQL khỏi Internet và khỏi tầng Reverse Proxy |
| `monitoring` | Bridge | `prometheus`, `grafana`, `loki`, `promtail`, `cadvisor`, `nginx-exporter`, `postgres-exporter`, `webapp`, `nginx` | Thu thập metrics, tập trung log và truyền cảnh báo nội bộ |

---

## 2. Cấu trúc thư mục dự án

```
.
├── app/                                # Ứng dụng Web Node.js/Express (CRUD + /metrics + /health)
│   ├── Dockerfile                      # Image node:20-alpine, chạy bằng user non-root "node"
│   ├── package.json
│   ├── server.js                       # REST API, kết nối PostgreSQL, Prometheus metrics, JSON/Text logs
│   └── public/                         # Giao diện SPA Quản lý Cửa hàng Thú cưng (HTML/CSS/JS)
├── db/
│   ├── 00-create-roles.sh              # Khởi tạo tài khoản phân quyền tối thiểu (petshop_app, petshop_monitor)
│   ├── init.sql                        # Schema 4 bảng (customers, pets, services, appointments) & dữ liệu mẫu
│   └── 20-grant-roles.sh               # Cấp quyền DML tối thiểu cho petshop_app
├── nginx/
│   ├── default.conf                    # Reverse proxy, chuyển hướng 80->443, TLS 1.2/1.3, Security Headers, Rate Limit
│   ├── proxy_params.conf               # Header chuyển tiếp IP thực (X-Real-IP, X-Forwarded-For, X-Forwarded-Proto)
│   └── certs/                          # Chứng chỉ số tự ký server.crt & khóa riêng server.key (mode 600)
├── prometheus/
│   └── prometheus.yml                  # Cấu hình thu thập 5 targets: prometheus, webapp, cadvisor, nginx, postgres
├── loki/
│   └── loki-config.yaml                # Cấu hình lưu trữ log tập trung (TSDB v13, retention 168h)
├── promtail/
│   └── promtail-config.yaml            # Tự động thu thập log từ Docker containers và gắn nhãn job, container
├── grafana/
│   ├── dashboards/petshop.json         # Dashboard 9 panels giám sát CPU, RAM, Nginx, PostgreSQL, Webapp, Log bảo mật
│   └── provisioning/                   # Tự động nạp Datasources (Prometheus, Loki), Dashboard và Alert Rule
├── scripts/
│   ├── gen-env.sh                      # Sinh file .env với mật khẩu mạnh ngẫu nhiên và phân quyền 600
│   ├── gen-cert.sh                     # Sinh chứng chỉ TLS tự ký RSA 2048-bit kèm SAN localhost/127.0.0.1
│   ├── attack-sim.sh                   # Script mô phỏng tấn công Brute-force vào /api/login
│   └── verify-hardening.sh             # Script kiểm tra tự động 8 hạng mục Hardening (Bước 6)
├── tests/
│   ├── smoke_api.sh                    # Kiểm thử tự động toàn bộ luồng đăng nhập & CRUD 4 bảng
│   └── check_logql.sh                  # Kiểm thử tự động luồng Promtail -> Loki -> Grafana Alerting
├── .env.example                        # Mẫu cấu hình biến môi trường (không chứa mật khẩu thật)
├── .gitignore                          # Loại trừ .env, *.key, *.crt, node_modules khỏi Git
└── docker-compose.yml                  # Định nghĩa toàn bộ 10 containers, 3 networks và 5 persistent volumes
```

---

## 3. Hướng dẫn cài đặt và khởi chạy từ đầu

### Bước 1: Clone kho mã nguồn
```bash
git clone https://github.com/hieu-kiien/DTC245200244.git
cd DTC245200244
```

### Bước 2: Khởi tạo biến môi trường `.env` và chứng chỉ số SSL/TLS tự ký
```bash
sh ./scripts/gen-env.sh
sh ./scripts/gen-cert.sh
```
*(Hoặc sao chép từ file mẫu: `cp .env.example .env`)*

### Bước 3: Khởi chạy toàn bộ hệ thống bằng Docker Compose
```bash
docker compose up -d --build
docker compose ps
```

### Bước 4: Truy cập các giao diện của hệ thống
| Dịch vụ | Địa chỉ truy cập | Tài khoản đăng nhập |
|---|---|---|
| **Website Quản lý PetShop (HTTPS)** | `https://localhost` *(HTTP `:80` tự động chuyển hướng `301`)* | `ADMIN_USER` / `ADMIN_PASSWORD` trong `.env` |
| **pgAdmin 4 (Quản trị PostgreSQL)** | `http://localhost:5050` *(chỉ lắng nghe `127.0.0.1`)* | `PGADMIN_EMAIL` / `PGADMIN_PASSWORD` trong `.env` |
| **Grafana (Dashboard, Explore, Alerting)** | `http://localhost:3000` *(chỉ lắng nghe `127.0.0.1`)* | `GRAFANA_USER` / `GRAFANA_PASSWORD` trong `.env` |
| **Prometheus (Targets & Metrics)** | `http://localhost:9090` *(chỉ lắng nghe `127.0.0.1`)* | Truy cập nội bộ tại `127.0.0.1` |

*(Khi kết nối Server mới trong pgAdmin 4, sử dụng Host name/address: `db`, Port: `5432`, Maintenance database: `petshop`, Username: `postgres`, Password: giá trị `DB_ADMIN_PASSWORD` trong `.env`).*

---

## 4. Hướng dẫn kiểm thử Giám sát, Truy vấn LogQL, Cảnh báo & Hardening

### 4.1. Kiểm thử API & CRUD tự động
```bash
bash ./tests/smoke_api.sh
```

### 4.2. Các câu truy vấn LogQL trên Grafana Explore (Datasource: `Loki`)
1. **Truy vấn các lần đăng nhập thất bại (dấu hiệu dò mật khẩu):**
   ```logql
   {job="webapp"} |= "LOGIN_FAILED"
   ```
2. **Truy vấn sự kiện bảo mật và cảnh báo nhận từ Grafana Webhook:**
   ```logql
   {job="webapp"} |~ "LOGIN_FAILED|ALERT_RECEIVED|ERROR"
   ```
3. **Truy vấn log truy cập Nginx tại đường dẫn đăng nhập:**
   ```logql
   {job="nginx"} |= "POST /api/login"
   ```

### 4.3. Mô phỏng tấn công Brute-force để kích hoạt Rate Limit & Cảnh báo Grafana
```bash
sh ./scripts/attack-sim.sh https://localhost
```
- Các request đầu tiên trả về `HTTP 401` và ghi nhận sự kiện `LOGIN_FAILED` vào Loki cùng bộ đếm `petshop_login_failed_total` trên Prometheus.
- Khi tốc độ vượt ngưỡng `burst=10`, Nginx lập tức chặn bằng mã `HTTP 429 Too Many Requests`.
- Khi tổng số lần `LOGIN_FAILED` trong 1 phút vượt quá 5 lần (`sum(count_over_time({job="webapp"} |= "LOGIN_FAILED" [1m])) > 5`), quy tắc cảnh báo **Brute-force đăng nhập (>5 lần thất bại / 1 phút)** trên Grafana chuyển sang trạng thái **Firing** và bắn webhook nội bộ về `http://webapp:3000/internal/alert`.

### 4.4. Kiểm tra tự động các biện pháp Hardening (Bước 6)
```bash
sh ./scripts/verify-hardening.sh
```
Script tự động xác minh 8 hạng mục bảo mật:
1. **Non-root Container User:** `petshop-webapp` chạy dưới quyền user `node` (`UID 1000`), `petshop-nginx` chạy dưới quyền `nginx-unprivileged` (`UID 101`).
2. **Read-only Root Filesystem & Capability Drop:** `read_only: true`, `cap_drop: [ALL]`, `security_opt: ["no-new-privileges:true"]`.
3. **Network Isolation:** CSDL `petshop-db` nằm trong mạng `backend` (`internal: true`), không mở cổng `5432` ra máy chủ host.
4. **Least-Privilege Database Roles:** Ứng dụng kết nối bằng `petshop_app` (chỉ có quyền `SELECT, INSERT, UPDATE, DELETE`), Exporter kết nối bằng `petshop_monitor` (`pg_monitor`), không dùng tài khoản quản trị `postgres`.
5. **HTTPS & TLS Hardening:** Chuyển hướng `HTTP 80 -> HTTPS 443 (301)`, chỉ cho phép `TLSv1.2` và `TLSv1.3` với bộ mã hóa ECDHE.
6. **HTTP Security Headers:** Đầy đủ `Strict-Transport-Security`, `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, ẩn phiên bản bằng `server_tokens off`.
7. **Ẩn đường dẫn nội bộ:** Nginx trả về `HTTP 404` đối với mọi truy cập từ bên ngoài vào `/metrics` và `/internal`.
8. **Giới hạn tài nguyên (Resource Limits):** Thiết lập `mem_limit`, `cpus`, `pids_limit` cho các dịch vụ nhằm chống tấn công cạn kiệt tài nguyên (DoS/Fork bomb).
