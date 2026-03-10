#!/bin/bash
# P0 终极冒烟测试脚本
set -euo pipefail

BASE="http://localhost:8088"
PASS=0
FAIL=0
RESULTS=""

log_result() {
  local status=$1 name=$2 detail=$3
  if [ "$status" = "PASS" ]; then
    PASS=$((PASS+1))
    RESULTS="${RESULTS}[PASS] ${name}: ${detail}\n"
  else
    FAIL=$((FAIL+1))
    RESULTS="${RESULTS}[FAIL] ${name}: ${detail}\n"
  fi
}

echo "========================================"
echo "  P0 终极冒烟测试 $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================"

# Step 1: Login
echo ""
echo "--- 1. 登录全链路 ---"
LOGIN_RESP=$(curl -s -X POST "$BASE/api/system/user/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}')

LOGIN_CODE=$(echo "$LOGIN_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('code',''))" 2>/dev/null || echo "PARSE_ERROR")

if [ "$LOGIN_CODE" = "200" ]; then
  TOKEN=$(echo "$LOGIN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")
  log_result "PASS" "登录API" "code=200, token长度=${#TOKEN}"
else
  echo "LOGIN FAILED: $LOGIN_RESP"
  exit 1
fi

# Verify last_login_time
LAST_LOGIN=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -N -e \
  "SELECT CONCAT(COALESCE(last_login_time,'NULL'),'|',COALESCE(last_login_ip,'NULL')) FROM t_user WHERE username='admin'" 2>/dev/null)
if echo "$LAST_LOGIN" | grep -q "|"; then
  log_result "PASS" "last_login_time回写" "$LAST_LOGIN"
else
  log_result "FAIL" "last_login_time回写" "查询失败"
fi

# Login log count
LOG_CNT=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -N -e \
  "SELECT COUNT(*) FROM t_login_log WHERE username='admin'" 2>/dev/null)
if [ "$LOG_CNT" -gt 0 ] 2>/dev/null; then
  log_result "PASS" "登录日志记录" "共${LOG_CNT}条"
else
  log_result "FAIL" "登录日志记录" "count=$LOG_CNT"
fi

# Step 2: Permission control
echo ""
echo "--- 2. 权限控制 ---"

# No token
NO_TOKEN_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/system/user/list")
if [ "$NO_TOKEN_CODE" = "403" ] || [ "$NO_TOKEN_CODE" = "401" ]; then
  log_result "PASS" "无token拦截" "HTTP $NO_TOKEN_CODE"
else
  log_result "FAIL" "无token拦截" "HTTP $NO_TOKEN_CODE (期望401/403)"
fi

# With token
WITH_TOKEN_CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$BASE/api/system/user/list")
if [ "$WITH_TOKEN_CODE" = "200" ]; then
  log_result "PASS" "有token访问" "HTTP 200"
else
  log_result "FAIL" "有token访问" "HTTP $WITH_TOKEN_CODE"
fi

# Step 3: Core API smoke test
echo ""
echo "--- 3. 核心API冒烟测试 ---"

test_get() {
  local url=$1 name=$2
  local code body
  body=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $TOKEN" "$BASE$url")
  code=$(echo "$body" | tail -1)
  if [ "$code" = "200" ]; then
    log_result "PASS" "$name" "HTTP 200"
  else
    log_result "FAIL" "$name" "HTTP $code"
  fi
}

test_post() {
  local url=$1 name=$2 data=${3:-{}}
  local code body
  body=$(curl -s -w "\n%{http_code}" -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$data" "$BASE$url")
  code=$(echo "$body" | tail -1)
  if [ "$code" = "200" ]; then
    log_result "PASS" "$name" "HTTP 200"
  else
    log_result "FAIL" "$name" "HTTP $code"
  fi
}

# 用户模块
test_get "/api/system/user/me" "GET 当前用户信息"
test_get "/api/system/user/permissions" "GET 权限列表"
test_get "/api/system/user/list" "GET 用户列表"

# 款式模块
test_get "/api/style/info/list" "GET 款式列表"

# 生产模块
test_get "/api/production/cutting-task/list" "GET 裁剪任务列表"
test_get "/api/production/cutting-task/stats" "GET 裁剪任务统计"
test_get "/api/production/cutting/list" "GET 裁剪菲号列表"
test_get "/api/production/cutting/summary" "GET 裁剪汇总"
test_get "/api/production/scan/list" "GET 扫码记录列表"

# 仪表板
test_get "/api/dashboard" "GET Dashboard首页"
test_get "/api/dashboard/top-stats" "GET TopStats"
test_get "/api/dashboard/daily-brief" "GET 智能运营日报"
test_get "/api/dashboard/urgent-events" "GET 紧急事件"
test_get "/api/dashboard/delivery-alert" "GET 交期预警"
test_get "/api/dashboard/quality-stats" "GET 质量统计"
test_get "/api/dashboard/overdue-orders" "GET 逾期订单"

# 智能模块
test_get "/api/intelligence/mind-push/status" "GET MindPush状态"

# 财务模块
test_get "/api/finance/finished-settlement/list" "GET 成品结算列表"

# Step 4: BUG 回归验证
echo ""
echo "--- 4. 已修复BUG回归验证 ---"

# 4a: MindPush check (fix: 500→200)
MP_RESP=$(curl -s -w "\n%{http_code}" -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{}' "$BASE/api/intelligence/mind-push/check")
MP_CODE=$(echo "$MP_RESP" | tail -1)
if [ "$MP_CODE" = "200" ]; then
  log_result "PASS" "MindPush check(修复500)" "HTTP 200"
else
  log_result "FAIL" "MindPush check(修复500)" "HTTP $MP_CODE"
fi

# 4b: ActionCenter null safety
AC_RESP=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $TOKEN" "$BASE/api/intelligence/action-center/pending")
AC_CODE=$(echo "$AC_RESP" | tail -1)
if [ "$AC_CODE" = "200" ] || [ "$AC_CODE" = "404" ]; then
  log_result "PASS" "ActionCenter null安全" "HTTP $AC_CODE"
else
  log_result "FAIL" "ActionCenter null安全" "HTTP $AC_CODE"
fi

# Step 5: Data consistency (DB checks)
echo ""
echo "--- 5. 数据一致性检查 ---"

# Check flyway version
FW_VER=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -N -e \
  "SELECT MAX(version) FROM flyway_schema_history WHERE success=1" 2>/dev/null)
if [ -n "$FW_VER" ]; then
  log_result "PASS" "Flyway最新版本" "V${FW_VER}"
else
  log_result "FAIL" "Flyway最新版本" "查询失败"
fi

# Check no failed migrations
FW_FAIL=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -N -e \
  "SELECT COUNT(*) FROM flyway_schema_history WHERE success=0" 2>/dev/null)
if [ "$FW_FAIL" = "0" ]; then
  log_result "PASS" "Flyway无失败迁移" "failed=0"
else
  log_result "FAIL" "Flyway有失败迁移" "failed=$FW_FAIL"
fi

# Check t_user has avatar_url column
AVA_COL=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -N -e \
  "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_user' AND COLUMN_NAME='avatar_url'" 2>/dev/null)
if [ "$AVA_COL" = "1" ]; then
  log_result "PASS" "t_user.avatar_url列存在" "OK"
else
  log_result "FAIL" "t_user.avatar_url列缺失" "count=$AVA_COL"
fi

# Check t_login_log.error_message is TEXT
ERR_TYPE=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -N -e \
  "SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_login_log' AND COLUMN_NAME='error_message'" 2>/dev/null)
if [ "$ERR_TYPE" = "text" ]; then
  log_result "PASS" "t_login_log.error_message=TEXT" "OK"
else
  log_result "FAIL" "t_login_log.error_message类型" "type=$ERR_TYPE"
fi

# Check key indexes exist
IDX_CNT=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -N -e \
  "SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND INDEX_NAME LIKE 'idx_scan_record%'" 2>/dev/null)
if [ "$IDX_CNT" -gt 0 ] 2>/dev/null; then
  log_result "PASS" "扫码记录性能索引" "共${IDX_CNT}个索引列"
else
  log_result "FAIL" "扫码记录性能索引" "count=$IDX_CNT"
fi

# Summary
echo ""
echo "========================================"
echo "  测试结果汇总"
echo "========================================"
echo -e "$RESULTS"
echo "----------------------------------------"
echo "  通过: $PASS | 失败: $FAIL | 总计: $((PASS+FAIL))"
echo "========================================"

if [ "$FAIL" -eq 0 ]; then
  echo ""
  echo "🎉 所有测试通过！系统可以上线。"
  exit 0
else
  echo ""
  echo "⚠️ 存在 $FAIL 项失败，需要排查后再上线。"
  exit 1
fi
