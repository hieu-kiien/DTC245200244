# 🐾 Hệ thống Quản lý Cửa hàng Thú cưng

**SV:** Vũ Hiếu Kiên – MSSV DTC245200244 – Đề 28 – Môn Triển khai & Quản trị Hệ thống Phần mềm (ICTU)

Website quản lý thú cưng, dịch vụ spa, khách hàng, lịch hẹn. Node.js (Express) + PostgreSQL + pgAdmin, đặt sau Nginx reverse proxy (HTTPS tự ký + security headers).

## Chạy hệ thống
```bash
./scripts/gen-env.sh     # sinh .env với mật khẩu mạnh
./scripts/gen-cert.sh    # sinh chứng chỉ HTTPS tự ký
docker compose up -d --build
```
Website: https://localhost · pgAdmin: http://localhost:5050
