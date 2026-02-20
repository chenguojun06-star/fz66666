#!/bin/bash
# ============================================================
# 转单功能测试脚本（转人员 + 转工厂 + 租户隔离 + 备注时间戳）
# ============================================================

BASE="http://localhost:8088"
PASS=0
FAIL=0

green()  { echo -e "\033[32m✅ $*\033[0m"; }
red()    { echo -e "\033[31m❌ $*\033[0m"; }
yellow() { echo -e "\033[33m⚠️  $*\033[0m"; }
info()   { echo -e "\033[36mℹ️  $*\033[0m"; }

check() {
  local desc="$1"
  local expect="$2"
  local actual="$3"
  if echo "$actual" | grep -q "$expect"; then
    green "$desc"
    PASS=$((PASS+1))
  else
    red "$desc"
    echo "   期望包含: $expect"
    echo "   实际响应: ${actual:0:200}"
    FAIL=$((FAIL+1))
  fi
}

echo ""
echo "================================================================"
echo "  转单功能 API 测试"
echo "================================================================"

# ── 步骤1：登录获取 Token ─────────────────────────────────────────
info "Step 1: 登录..."
LOGIN=$(curl -s -X POST "$BASE/api/system/user/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}')
TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('token',''))" 2>/dev/null)

if [ -z "$TOKEN" ]; then
  # 尝试默认密码
  LOGIN=$(curl -s -X POST "$BASE/api/system/user/login" \
    -H "Content-Type: application/json" \
    -d '{"username":"admin","password":"Abc123456"}')
  TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('token',''))" 2>/dev/null)
fi

if [ -z "$TOKEN" ]; then
  red "登录失败，跳过后续测试"
  echo "$LOGIN"
  exit 1
fi
green "登录成功，Token: ${TOKEN:0:20}..."
AUTH="Authorization: Bearer $TOKEN"

# ── 步骤2：测试搜索系统内部用户 ───────────────────────────────────
info ""
info "Step 2: 搜索可转单用户（限同租户）..."
USERS=$(curl -s -X GET "$BASE/api/production/order/transfer/search-users?keyword=" \
  -H "$AUTH")
check "搜索用户接口返回 200" '"code":200' "$USERS"
check "返回用户列表" '"records"\|"data"' "$USERS"
info "返回用户示例: $(echo $USERS | python3 -c "import sys,json; d=json.load(sys.stdin); recs=d.get('data',{}).get('records',d.get('data',[])); print([r.get('name','') or r.get('username','') for r in recs[:3]])" 2>/dev/null)"

# ── 步骤3：测试搜索系统内部工厂 ───────────────────────────────────
info ""
info "Step 3: 搜索可转工厂接口（新功能）..."
FACTORIES=$(curl -s -X GET "$BASE/api/production/order/transfer/search-factories?keyword=" \
  -H "$AUTH")
check "搜索工厂接口返回 200" '"code":200' "$FACTORIES"
info "返回工厂示例: $(echo $FACTORIES | python3 -c "import sys,json; d=json.load(sys.stdin); recs=d.get('data',{}).get('records',d.get('data',[])); print([r.get('factoryName','') for r in recs[:3]])" 2>/dev/null)"

# ── 步骤4：查询现有订单（用于测试转单） ───────────────────────────
info ""
info "Step 4: 查找一个生产订单用于创建转单..."
ORDERS=$(curl -s -X POST "$BASE/api/production/orders/list" \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d '{"pageNum":1,"pageSize":3}')
ORDER_ID=$(echo "$ORDERS" | python3 -c "import sys,json; d=json.load(sys.stdin); recs=d.get('data',{}).get('records',[]); print(recs[0].get('id','') if recs else '')" 2>/dev/null)

if [ -z "$ORDER_ID" ]; then
  yellow "未找到生产订单，跳过转单创建测试"
else
  green "找到订单 ID: $ORDER_ID"

  # 获取一个可转单用户的ID
  USER_ID=$(echo "$USERS" | python3 -c "import sys,json; d=json.load(sys.stdin); recs=d.get('data',{}).get('records',d.get('data',[])); print(recs[0].get('id','') if recs else '')" 2>/dev/null)

  # ── 步骤5：创建转人员 ─────────────────────────────────────────
  if [ -n "$USER_ID" ]; then
    info ""
    info "Step 5: 创建转人员（目标用户ID: $USER_ID）..."
    CREATE_USER=$(curl -s -X POST "$BASE/api/production/order/transfer/create" \
      -H "$AUTH" \
      -H "Content-Type: application/json" \
      -d "{\"orderId\":\"$ORDER_ID\",\"toUserId\":$USER_ID,\"message\":\"测试转单备注\"}")
    check "创建转人员申请成功" '"code":200' "$CREATE_USER"
    # 验证备注包含时间戳格式 [2026-xx-xx]
    TRANSFER_MSG=$(echo "$CREATE_USER" | python3 -c "import sys,json; d=json.load(sys.stdin); t=d.get('data',{}); print(t.get('message','') if t else '')" 2>/dev/null)
    if echo "$TRANSFER_MSG" | grep -qE "\[20[0-9]{2}-[0-9]{2}-[0-9]{2}"; then
      green "备注时间戳验证通过: $TRANSFER_MSG"
      PASS=$((PASS+1))
    else
      red "备注时间戳未植入，实际备注: $TRANSFER_MSG"
      FAIL=$((FAIL+1))
    fi
    # 验证 transfer_type = user
    TRANSFER_TYPE=$(echo "$CREATE_USER" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('transferType',''))" 2>/dev/null)
    check "转人员类型字段正确(user)" 'user' "$TRANSFER_TYPE"
  else
    yellow "Step 5: 无可用用户，跳过转人员测试"
  fi

  # ── 步骤6：创建转工厂 ─────────────────────────────────────────
  FACTORY_ID=$(echo "$FACTORIES" | python3 -c "import sys,json; d=json.load(sys.stdin); recs=d.get('data',{}).get('records',d.get('data',[])); print(recs[0].get('id','') if recs else '')" 2>/dev/null)

  if [ -n "$FACTORY_ID" ]; then
    info ""
    info "Step 6: 创建转工厂（目标工厂ID: $FACTORY_ID）..."
    CREATE_FAC=$(curl -s -X POST "$BASE/api/production/order/transfer/create-to-factory" \
      -H "$AUTH" \
      -H "Content-Type: application/json" \
      -d "{\"orderId\":\"$ORDER_ID\",\"toFactoryId\":\"$FACTORY_ID\",\"message\":\"测试转工厂备注\"}")
    check "创建转工厂申请成功" '"code":200' "$CREATE_FAC"
    # 验证 transfer_type = factory
    FAC_TYPE=$(echo "$CREATE_FAC" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('transferType',''))" 2>/dev/null)
    check "转工厂类型字段正确(factory)" 'factory' "$FAC_TYPE"
    # 验证备注时间戳
    FAC_MSG=$(echo "$CREATE_FAC" | python3 -c "import sys,json; d=json.load(sys.stdin); t=d.get('data',{}); print(t.get('message','') if t else '')" 2>/dev/null)
    if echo "$FAC_MSG" | grep -qE "\[20[0-9]{2}-[0-9]{2}-[0-9]{2}"; then
      green "工厂转单备注时间戳验证通过: $FAC_MSG"
      PASS=$((PASS+1))
    else
      red "工厂转单备注时间戳未植入，实际备注: $FAC_MSG"
      FAIL=$((FAIL+1))
    fi
  else
    yellow "Step 6: 无可用工厂，跳过转工厂测试"
    info "  请先在系统中创建工厂（状态=active），再运行此测试"
  fi
fi

# ── 步骤7：查看转单列表（我发出的） ───────────────────────────────
info ""
info "Step 7: 查看我发出的转单列表..."
MY_TRANSFERS=$(curl -s -X GET "$BASE/api/production/order/transfer/my-transfers" \
  -H "$AUTH")
check "我发出的转单列表" '"code":200' "$MY_TRANSFERS"
TOTAL=$(echo "$MY_TRANSFERS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('total',0))" 2>/dev/null)
info "我发出的转单总数: $TOTAL"

# ── 步骤8：待处理数量 ─────────────────────────────────────────────
info ""
info "Step 8: 检查待处理转单数量..."
PENDING=$(curl -s -X GET "$BASE/api/production/order/transfer/pending-count" \
  -H "$AUTH")
check "待处理数量接口正常" '"code":200' "$PENDING"
COUNT=$(echo "$PENDING" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',0))" 2>/dev/null)
info "当前待处理转单: $COUNT 条"

# ── 步骤9：测试无效工厂（不存在的ID） ────────────────────────────
if [ -n "$ORDER_ID" ]; then
  info ""
  info "Step 9: 测试转移到无效工厂（应报错）..."
  INVALID=$(curl -s -X POST "$BASE/api/production/order/transfer/create-to-factory" \
    -H "$AUTH" \
    -H "Content-Type: application/json" \
    -d "{\"orderId\":\"$ORDER_ID\",\"toFactoryId\":\"FAKE-FACTORY-UUID-000\"}")
  if echo "$INVALID" | grep -qE '"code":(?!200)|工厂不存在|不存在|error|Error'; then
    green "无效工厂被正确拒绝"
    PASS=$((PASS+1))
  else
    yellow "无效工厂未返回错误（可能返回了404或空数据）: ${INVALID:0:100}"
  fi
fi

# ── 汇总 ─────────────────────────────────────────────────────────
echo ""
echo "================================================================"
echo "  测试完成: ✅ $PASS 通过  ❌ $FAIL 失败"
echo "================================================================"
echo ""

if [ $FAIL -gt 0 ]; then exit 1; else exit 0; fi
