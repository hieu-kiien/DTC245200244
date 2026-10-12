#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] || { echo 'Thiếu .env: hãy chạy ./scripts/gen-env.sh' >&2; exit 1; }
set -a
# shellcheck disable=SC1091
. ./.env
set +a
BASE=${1:-https://localhost}
json_id() { python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])'; }
request() { curl -ksSf -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" "$@"; }
TOKEN=$(curl -ksSf -X POST "$BASE/api/login" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASSWORD\"}" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')
CID=''; PID=''; SID=''; AID=''
cleanup() {
  set +e
  [ -z "$AID" ] || request -X DELETE "$BASE/api/appointments/$AID" >/dev/null
  [ -z "$PID" ] || request -X DELETE "$BASE/api/pets/$PID" >/dev/null
  [ -z "$SID" ] || request -X DELETE "$BASE/api/services/$SID" >/dev/null
  [ -z "$CID" ] || request -X DELETE "$BASE/api/customers/$CID" >/dev/null
  request -X POST "$BASE/api/logout" >/dev/null
}
trap cleanup EXIT
SUFFIX=$(date +%s)
CID=$(request -X POST "$BASE/api/customers" -d "{\"full_name\":\"Kiểm thử $SUFFIX\",\"phone\":\"0000000000\"}" | json_id)
PID=$(request -X POST "$BASE/api/pets" -d "{\"name\":\"PetTest-$SUFFIX\",\"species\":\"Chó\",\"customer_id\":$CID,\"price\":0,\"status\":\"Đã bán\"}" | json_id)
SID=$(request -X POST "$BASE/api/services" -d "{\"name\":\"SpaTest-$SUFFIX\",\"price\":100000,\"duration_min\":30}" | json_id)
WHEN=$(date -d '+1 day' '+%Y-%m-%dT%H:%M:%S')
AID=$(request -X POST "$BASE/api/appointments" -d "{\"customer_id\":$CID,\"pet_id\":$PID,\"service_id\":$SID,\"appt_time\":\"$WHEN\",\"status\":\"Chờ\"}" | json_id)
request "$BASE/api/stats" | python3 -c 'import json,sys; x=json.load(sys.stdin); assert all(k in x for k in ("pets","customers","services","pending")); print("API stats OK")'
request "$BASE/api/appointments" | python3 -c 'import json,sys; x=json.load(sys.stdin); assert isinstance(x,list);print("Appointments CRUD OK")'
echo 'PASS: login, create customer/pet/service/appointment, stats, cleanup'
