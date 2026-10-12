#!/bin/sh
set -eu
export MSYS_NO_PATHCONV=1
BASE=$(CDPATH='' cd -- "$(dirname "$0")/.." && pwd)
DIR="$BASE/nginx/certs"
mkdir -p "$DIR"
if [ -e "$DIR/server.key" ] || [ -e "$DIR/server.crt" ]; then
  if [ -f "$DIR/server.key" ] && [ -f "$DIR/server.crt" ]; then
    chmod 600 "$DIR/server.key" 2>/dev/null || true
    chmod 644 "$DIR/server.crt" 2>/dev/null || true
    echo 'Chứng chỉ đã tồn tại; đã kiểm tra quyền khóa riêng (600).'
    exit 0
  fi
  echo 'Thiếu một phần cặp server.key/server.crt; kiểm tra trước khi sinh lại.' >&2
  exit 1
fi
umask 077
openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
  -keyout "$DIR/server.key" -out "$DIR/server.crt" \
  -subj '/C=VN/ST=Thai Nguyen/O=ICTU/OU=CNTT-K23C/CN=localhost' \
  -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1'
chmod 600 "$DIR/server.key"
chmod 644 "$DIR/server.crt"
echo 'Đã sinh chứng chỉ TLS tự ký (RSA 2048-bit, SAN localhost/127.0.0.1); khóa riêng có quyền 600.'
