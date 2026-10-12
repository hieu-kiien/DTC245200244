#!/bin/sh
# Tạo chứng chỉ HTTPS tự ký cho Nginx
mkdir -p "$(dirname "$0")/../nginx/certs"
openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
  -keyout "$(dirname "$0")/../nginx/certs/server.key" \
  -out "$(dirname "$0")/../nginx/certs/server.crt" \
  -subj "/C=VN/ST=Thai Nguyen/O=ICTU/CN=localhost"
chmod 644 "$(dirname "$0")/../nginx/certs/server.crt" "$(dirname "$0")/../nginx/certs/server.key"
