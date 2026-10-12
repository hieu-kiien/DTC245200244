#!/bin/sh
set -eu
[ "$(id -u)" -ne 0 ] || { echo 'Không chạy script bằng sudo/root; Nginx non-root cần sở hữu private key' >&2; exit 1; }
BASE=$(CDPATH='' cd -- "$(dirname "$0")/.." && pwd)
DIR="$BASE/nginx/certs"
mkdir -p "$DIR"
if [ -e "$DIR/server.key" ] || [ -e "$DIR/server.crt" ]; then
  if [ -f "$DIR/server.key" ] && [ -f "$DIR/server.crt" ]; then
    echo 'Chứng chỉ đã tồn tại; kiểm tra chủ sở hữu và quyền key (600).'
    exit 0
  fi
  echo 'Thiếu một phần cặp server.key/server.crt; kiểm tra trước khi sinh lại.' >&2
  exit 1
fi
umask 077
openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
  -keyout "$DIR/server.key" -out "$DIR/server.crt" \
  -subj '/C=VN/ST=Thai Nguyen/O=ICTU/CN=localhost' \
  -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1'
chmod 600 "$DIR/server.key"
chmod 644 "$DIR/server.crt"
echo 'Đã sinh chứng chỉ self-signed; khóa riêng có quyền 600.'
