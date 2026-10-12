#!/bin/sh
# Mô phỏng tấn công dò mật khẩu (brute-force) vào trang đăng nhập để kiểm thử cảnh báo
HOST=${1:-https://localhost}
for i in $(seq 1 30); do
  curl -sk -o /dev/null -w "lần $i -> HTTP %{http_code}\n" -X POST "$HOST/api/login" \
    -H 'Content-Type: application/json' \
    -d "{\"username\":\"admin\",\"password\":\"guess$i\"}"
done
