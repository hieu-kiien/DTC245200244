# 🐾 PetShop – Đề 28 · DTC245200244

Bài tập lớn môn **Triển khai và Quản trị Hệ thống Phần mềm**: website quản lý khách hàng, thú cưng, dịch vụ spa và lịch hẹn; triển khai bằng **Docker Compose** cùng PostgreSQL/pgAdmin, Nginx (HTTPS), Prometheus/Grafana, Loki/Promtail.

**Sinh viên:** Vũ Hiếu Kiên · **MSSV:** DTC245200244 · **Lớp:** CNTT K23C · **GVHD:** Vũ Việt Dũng.

> Repository bao gồm mã nguồn và cấu hình sẵn. Kết quả chạy trên host cụ thể (targets UP, LogQL trả log, alert Firing, container healthy) **phải được kiểm chứng thực tế**, không được suy ra chỉ từ việc có file cấu hình.

## Kiến trúc

```text
Trình duyệt ──HTTPS──> Nginx :443 ──> Express webapp :3000
                                          │
                                     backend (internal)
                                          │
                                       PostgreSQL <─ pgAdmin (chỉ host loopback)
Prometheus <─ cAdvisor · nginx-exporter · postgres-exporter · /metrics của webapp
Grafana <── Prometheus, Loki <── Promtail <── Docker logs
```

Đây là **một ứng dụng nghiệp vụ Express (monolith) tách khỏi các dịch vụ hạ tầng bằng container**, không phải nhiều microservice nghiệp vụ. Backend Docker network đặt `internal: true`, database không publish port.

## Yêu cầu môi trường

- Linux hoặc WSL2 chạy Docker Engine 24+ và plugin Compose v2; cần `sh`, `openssl`, `curl`. Hướng dẫn dùng UID/GID của người chạy Linux để Nginx non-root đọc được private key mode 600; Docker Desktop trên macOS/Windows cần điều chỉnh và kiểm chứng quyền bind mount.
- Khoảng 4 GB RAM trở lên là mức gợi ý để khởi chạy đầy đủ stack, không phải bảo đảm hiệu năng.
- Cổng 80/443 của host chưa bị chương trình khác chiếm dụng.
- **Không dùng `sudo` để chạy script sinh .env và chứng chỉ**.

## Khởi chạy từ bản clone mới và database volume mới

```bash
git clone https://github.com/hieu-kiien/DTC245200244.git petshop
cd petshop
./scripts/gen-env.sh
./scripts/gen-cert.sh
docker compose config -q
docker compose up -d --build
docker compose ps
```

Trong giai đoạn PR, muốn thử các thay đổi trước khi nhập `main`: sau khi clone, chạy `git checkout fix/petshop-review` **trước khi** tạo `.env` và cert.

Truy cập:
- Website: **https://localhost** (HTTPS tự ký, trình duyệt cảnh báo chứng chỉ chưa được CA tin cậy).
- pgAdmin: **http://localhost:5050**. Host của PostgreSQL trong pgAdmin: `db`, port `5432`, database từ `DB_NAME`.
- Grafana: **http://localhost:3000**; Prometheus: **http://localhost:9090**.
- Tài khoản/mật khẩu lấy từ `.env` sinh trên **máy của bạn**; **không đưa file này vào GitHub, báo cáo hay ảnh chụp**.

### Cảnh báo quan trọng cho volume PostgreSQL đã có dữ liệu

Phiên bản nâng cấp thay `POSTGRES_USER` ban đầu (tài khoản superuser ứng dụng) thành tài khoản admin `postgres` và 2 role quyền tối thiểu. Các file `db/00-create-roles.sh`, `db/init.sql`, `db/20-grant-roles.sh` chỉ chạy khi **PostgreSQL volume được khởi tạo lần đầu**.

Nếu bạn đã triển khai phiên bản cũ trên volume có dữ liệu, **không chạy `docker compose down -v`** và không mong chờ script init tự chạy lại: trước tiên hãy sao lưu rồi lên kế hoạch migration/role cho DB hiện có. Để demo trên volume mới, chỉ reset khi đã xác nhận dữ liệu không cần giữ.

## Thành phần và tính năng

- `app/server.js`: Node.js/Express, CRUD `customers`, `pets`, `services`, `appointments`, tổng quan, `/health` và `/metrics`; app chạy non-root và root filesystem read-only.
- `db/init.sql`: 4 bảng liên kết khóa ngoại, giá trị có CHECK cơ bản, dữ liệu mẫu. Lịch hẹn cần khách + pet + service + thời gian; API từ chối pet có chủ không khớp khách.
- **Xác thực mức demo**: token phát sinh ngẫu nhiên lưu RAM, hết hạn 8 giờ và có API `/api/logout` thu hồi token; không dùng làm thiết kế auth cho production.
- Nginx proxy cổng 80→443, CSP/headers, rate-limit login; từ bên ngoài chặn `/metrics` và `/internal`.
- Prometheus scrape jobs `prometheus`, `webapp`, `cadvisor`, `nginx`, `postgres` (15 giây); Grafana có datasource Prometheus/Loki và dashboard PetShop.
- Promtail truy vấn Docker socket để đưa log về Loki, hỗ trợ LogQL. Loki khai báo compactor retention 7 ngày (việc xóa dữ liệu cũ phải kiểm chứng trong hệ thống chạy).
- Grafana có rule mô phỏng brute-force: `LOGIN_FAILED` lớn hơn 5 log trong 1 phút → webhook nội bộ `/internal/alert`.

## LogQL và kiểm thử alert

Grafana → Explore → Loki:

```logql
{job="webapp"} |= "LOGIN_FAILED"
{job="webapp"} |~ "(ERROR|Exception|Failed)"
{job="nginx"} |~ " 5[0-9]{2} "
{job="webapp"} |~ "LOGIN_FAILED|ALERT_RECEIVED"
```

Tạo sự kiện đăng nhập sai trên chính môi trường lab bạn quản lý:

```bash
./scripts/attack-sim.sh https://localhost
```

Sau đó kiểm tra **Grafana → Alerting**, **Grafana → Explore → Loki**, và `docker compose logs webapp`. Chỉ xác nhận cảnh báo chuyển **Firing** hoặc webhook thành công khi quan sát được thực tế.

## Hardening – điểm đạt và giới hạn

- App non-root, `cap_drop: ALL`, `read_only: true`, `no-new-privileges`; Nginx non-root dùng UID/GID chủ khóa tự ký, `server.key` là mode 600.
- Database không publish cổng và dùng role `petshop_app` chỉ được thao tác trên bảng nghiệp vụ, role `petshop_monitor` có quyền theo dõi `pg_monitor`; không dùng role postgres trong webapp.
- Dashboard/pgAdmin/Prometheus bind `127.0.0.1`; mật khẩu sinh riêng, `.env` bị gitignore.
- **Ngoại lệ quyền trong lab:** cAdvisor bật `privileged: true`, Promtail mount `docker.sock:ro` (socket `:ro` **không** bảo đảm chỉ có quyền API đọc). Không coi stack là an toàn production hoặc multi-tenant.
- `/internal/alert` chỉ được ngăn truy cập từ Nginx công khai, **chưa có xác thực webhook nội bộ**; các token quản trị lưu RAM, chưa có RBAC và audit đầy đủ.

## Kiểm thử và minh chứng

```bash
docker compose config -q
docker compose ps
docker compose logs --tail 80 db webapp nginx prometheus loki promtail grafana
curl -sk https://localhost/health
curl -skI https://localhost/
./tests/smoke_api.sh
./tests/check_logql.sh   # thử 30 đăng nhập sai và kiểm tra Loki + webhook Grafana
```

Chi tiết các lệnh và danh sách ảnh cần chụp: **[TEST_DEMO.md](TEST_DEMO.md)**. Các lệnh cấu hình và workflow CI chỉ kiểm tra một phần; không chứng minh đã chạy trọn stack.

## Lịch sử theo giai đoạn yêu cầu

1. [Commit 1 – Web + DB + Nginx](https://github.com/hieu-kiien/DTC245200244/commit/3e0c64745354d43c91a2d771a243353009127e8f)
2. [Commit 2 – Prometheus + Grafana](https://github.com/hieu-kiien/DTC245200244/commit/33da669949c6816ba9d926623dd570b6dd24c1e5)
3. [Commit 3 – Loki + Promtail + hardening](https://github.com/hieu-kiien/DTC245200244/commit/20903efaf98983b10fe518f066d0d490887ae5db)

Các commit tiếp theo sửa lỗi hoặc tăng khả năng kiểm chứng; đề yêu cầu có ít nhất ba commit có ý nghĩa, không giới hạn repository phải có đúng ba.
