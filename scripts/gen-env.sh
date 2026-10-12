#!/bin/sh
# Sinh file .env với mật khẩu mạnh ngẫu nhiên (không commit file này)
cd "$(dirname "$0")/.."
[ -f .env ] && { echo ".env đã tồn tại"; exit 0; }
r() { openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 20; }
cat > .env <<EOF
DB_NAME=petshop
DB_USER=petshop_app
DB_PASSWORD=$(r)Aa1
ADMIN_USER=admin
ADMIN_PASSWORD=$(r)Aa1
PGADMIN_EMAIL=admin@petshop.local
PGADMIN_PASSWORD=$(r)Aa1
GRAFANA_USER=admin
GRAFANA_PASSWORD=$(r)Aa1
EOF
chmod 600 .env
echo "Đã tạo .env"
