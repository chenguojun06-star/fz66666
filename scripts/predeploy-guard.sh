#!/bin/bash
set -euo pipefail

BASE="${1:-http://localhost:8088}"
USERNAME="${SMOKE_USER:-admin}"
PASSWORD="${SMOKE_PASS:-admin123}"

PASS=0
FAIL=0

pass() {
  PASS=$((PASS+1))
  echo "[PASS] $1"
}

fail() {
  FAIL=$((FAIL+1))
  echo "[FAIL] $1"
}

extract_json() {
  local expr="$1"
  python3 -c "import sys,json; data=json.load(sys.stdin); print(${expr})"
}

login() {
  local resp
  resp=$(curl -s -X POST "$BASE/api/system/user/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}")

  local code
  code=$(echo "$resp" | extract_json "data.get('code', '')" 2>/dev/null || echo "")
  if [ "$code" != "200" ]; then
    echo "$resp"
    echo "登录失败，无法继续发布前守卫检查"
    exit 1
  fi

  TOKEN=$(echo "$resp" | extract_json "data['data']['token']")
  pass "登录成功"
}

check_get() {
  local url="$1"
  local name="$2"
  local code
  code=$(curl -s -o /tmp/predeploy_guard_resp.txt -w "%{http_code}" \
    -H "Authorization: Bearer $TOKEN" "$BASE$url")
  if [ "$code" = "200" ]; then
    pass "$name"
  else
    fail "$name -> HTTP $code"
    head -c 400 /tmp/predeploy_guard_resp.txt || true
    echo
  fi
}

check_post() {
  local url="$1"
  local name="$2"
  local body="${3:-{}}"
  local code
  code=$(curl -s -o /tmp/predeploy_guard_resp.txt -w "%{http_code}" \
    -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$body" "$BASE$url")
  if [ "$code" = "200" ]; then
    pass "$name"
  else
    fail "$name -> HTTP $code"
    head -c 400 /tmp/predeploy_guard_resp.txt || true
    echo
  fi
}

echo "========================================"
echo "发布前结构健康与 P0 冒烟守卫"
echo "BASE=$BASE"
echo "TIME=$(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================"

login

ACTUATOR_CODE=$(curl -s -o /tmp/predeploy_guard_resp.txt -w "%{http_code}" "$BASE/actuator/health")
if [ "$ACTUATOR_CODE" = "200" ]; then
  pass "Actuator 健康检查"
else
  fail "Actuator 健康检查 -> HTTP $ACTUATOR_CODE"
fi

STRUCTURE_RESP=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/api/system/status/structure-health")
STRUCTURE_CODE=$(echo "$STRUCTURE_RESP" | extract_json "data.get('code', '')" 2>/dev/null || echo "")
if [ "$STRUCTURE_CODE" = "200" ]; then
  STRUCTURE_HEALTHY=$(echo "$STRUCTURE_RESP" | extract_json "str(data['data'].get('healthy', False)).lower()")
  BLOCKING_COUNT=$(echo "$STRUCTURE_RESP" | extract_json "data['data'].get('blockingIssueCount', 0)")
  if [ "$STRUCTURE_HEALTHY" = "true" ] && [ "$BLOCKING_COUNT" = "0" ]; then
    pass "数据库结构健康检查"
  else
    fail "数据库结构健康检查 -> healthy=$STRUCTURE_HEALTHY blockingIssueCount=$BLOCKING_COUNT"
    echo "$STRUCTURE_RESP" | python3 -c "import sys,json; data=json.load(sys.stdin); print(json.dumps(data['data'].get('blockingIssues', []), ensure_ascii=False, indent=2))"
  fi
else
  fail "数据库结构健康检查接口不可用"
fi

check_get "/api/system/status/overview" "系统状态总览"
check_get "/api/production/order/list?page=1&pageSize=1" "生产订单列表（标准路由）"
check_post "/api/production/orders/list" "生产订单列表（兼容路由）" '{}'
check_get "/api/material/database/list?page=1&pageSize=1" "面辅料数据库列表"
check_get "/api/intelligence/action-center" "动作中心"
check_get "/api/intelligence/brain/snapshot" "智能大脑快照"
check_get "/api/intelligence/ai-advisor/status" "AI 顾问状态"

echo "----------------------------------------"
echo "通过: $PASS"
echo "失败: $FAIL"
echo "----------------------------------------"

if [ "$FAIL" -gt 0 ]; then
  echo "发布前守卫未通过，请先修复失败项。"
  exit 1
fi

echo "发布前守卫通过，可以继续发布。"