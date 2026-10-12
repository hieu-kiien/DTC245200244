#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
[ ! -f .env ] || { echo '.env đã tồn tại; không ghi đè'; exit 0; }
[ "$(id -u)" -ne 0 ] || { echo 'Không chạy gen-env.sh bằng root/sudo'; exit 1; }
command -v openssl >/dev/null || { echo 'Yêu cầu openssl'; exit 1; }
randpass() { printf '%sAa1' "$(openssl rand -hex 16)"; }
umask 077
cat > .env <<EOV
DB_NAME=petshop
DB_USER=petshop_app
DB_PASSWORD=$(randpass)
DB_ADMIN_PASSWORD=$(randpass)
MONITOR_DB_USER=petshop_monitor
MONITOR_DB_PASSWORD=$(randpass)
ADMIN_USER=admin
ADMIN_PASSWORD=$(randpass)
PGADMIN_EMAIL=admin@petshop.local
PGADMIN_PASSWORD=$(randpass)
GRAFANA_USER=admin
GRAFANA_PASSWORD=$(randpass)
NGINX_UID=$(id -u)
NGINX_GID=$(id -g)
EOV
chmod 600 .env
printf '%s\n' 'Đã tạo .env; KHÔNG commit file này.'
