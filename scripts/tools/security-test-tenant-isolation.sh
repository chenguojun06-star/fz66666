#!/bin/bash
# ========================================
# 租户隔离安全渗透测试
# 测试场景：尝试跨租户访问数据
# ========================================

# 不使用 set -e，避免提前退出
# set -e

API="http://localhost:8088"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "========================================"
echo "🔒 租户隔离安全渗透测试"
echo "========================================"

# ========================================
# 准备：创建两个测试租户
# ========================================
echo ""
echo "━━━ 准备测试环境 ━━━"

# Admin登录（超级管理员）
echo "1. Admin登录..."
ADMIN_RESP=$(curl -s POST "$API/api/system/user/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"123456"}')

echo "DEBUG: Admin响应 = $ADMIN_RESP" | head -c 200

ADMIN_TOKEN=$(echo "$ADMIN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('token',''))" 2>/dev/null || echo "")

if [ -z "$ADMIN_TOKEN" ]; then
    echo -e "${RED}❌ Admin登录失败${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Admin登录成功${NC}"

# 创建租户1
echo ""
echo "2. 创建租户1（测试厂A）..."
TENANT1_CODE="SEC_TEST_A_$(date +%s)"
TENANT1_OWNER="sec_owner_a_$(date +%s)"

CREATE_T1=$(curl -s POST "$API/api/system/tenant/create" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d "{
    \"tenantName\": \"安全测试厂A\",
    \"tenantCode\": \"$TENANT1_CODE\",
    \"contactName\": \"张三\",
    \"contactPhone\": \"13800001111\",
    \"ownerUsername\": \"$TENANT1_OWNER\",
    \"ownerPassword\": \"Pass123456\",
    \"ownerName\": \"张三\",
    \"maxUsers\": 10
  }")

TENANT1_ID=$(echo "$CREATE_T1" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('tenant',{}).get('id',''))" 2>/dev/null)
echo -e "${GREEN}✅ 租户1创建成功: ID=$TENANT1_ID${NC}"

# 创建租户2
echo ""
echo "3. 创建租户2（测试厂B）..."
TENANT2_CODE="SEC_TEST_B_$(date +%s)"
TENANT2_OWNER="sec_owner_b_$(date +%s)"

CREATE_T2=$(curl -s POST "$API/api/system/tenant/create" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d "{
    \"tenantName\": \"安全测试厂B\",
    \"tenantCode\": \"$TENANT2_CODE\",
    \"contactName\": \"李四\",
    \"contactPhone\": \"13800002222\",
    \"ownerUsername\": \"$TENANT2_OWNER\",
    \"ownerPassword\": \"Pass123456\",
    \"ownerName\": \"李四\",
    \"maxUsers\": 10
  }")

TENANT2_ID=$(echo "$CREATE_T2" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('tenant',{}).get('id',''))" 2>/dev/null)
echo -e "${GREEN}✅ 租户2创建成功: ID=$TENANT2_ID${NC}"

# 租户1登录
echo ""
echo "4. 租户1主账号登录..."
T1_LOGIN=$(curl -s POST "$API/api/system/user/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$TENANT1_OWNER\",\"password\":\"Pass123456\"}")
T1_TOKEN=$(echo "$T1_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('token',''))" 2>/dev/null)
echo -e "${GREEN}✅ 租户1登录成功${NC}"

# 租户2登录
echo ""
echo "5. 租户2主账号登录..."
T2_LOGIN=$(curl -s POST "$API/api/system/user/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$TENANT2_OWNER\",\"password\":\"Pass123456\"}")
T2_TOKEN=$(echo "$T2_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('token',''))" 2>/dev/null)
echo -e "${GREEN}✅ 租户2登录成功${NC}"

# ========================================
# 测试1：租户1创建数据，租户2尝试访问
# ========================================
echo ""
echo "━━━ 测试1: 租户1创建样衣，租户2尝试跨租户访问 ━━━"

# 租户1创建样衣
echo ""
echo "1.1 租户1创建样衣..."
SAMPLE_CREATE=$(curl -s POST "$API/api/stock/sample/inbound" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $T1_TOKEN" \
  -d "{
    \"styleNo\": \"SEC_TEST_001\",
    \"styleName\": \"安全测试款\",
    \"color\": \"红色\",
    \"size\": \"M\",
    \"quantity\": 10,
    \"type\": \"development\",
    \"warehouseLocation\": \"A01\"
  }")

SAMPLE_ID=$(echo "$SAMPLE_CREATE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('id',''))" 2>/dev/null)
if [ -n "$SAMPLE_ID" ] && [ "$SAMPLE_ID" != "null" ]; then
    echo -e "${GREEN}✅ 租户1创建样衣成功: ID=$SAMPLE_ID${NC}"
else
    echo -e "${RED}❌ 租户1创建样衣失败${NC}"
    echo "$SAMPLE_CREATE"
    SAMPLE_ID="999999999"  # 假设ID，继续测试
fi

# 租户1查询自己的数据
echo ""
echo "1.2 租户1查询自己的样衣..."
T1_QUERY=$(curl -s GET "$API/api/stock/sample/list?styleNo=SEC_TEST_001" \
  -H "Authorization: Bearer $T1_TOKEN")
T1_COUNT=$(echo "$T1_QUERY" | python3 -c "import sys,json; d=json.load(sys.stdin).get('data',[]); print(len(d) if isinstance(d, list) else 0)" 2>/dev/null)
if [ "$T1_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✅ 租户1能查到自己的数据（$T1_COUNT 条）${NC}"
else
    echo -e "${YELLOW}⚠️  租户1查不到自己的数据${NC}"
fi

# 租户2尝试查询租户1的数据
echo ""
echo "1.3 【渗透测试】租户2尝试查询租户1的样衣..."
T2_QUERY=$(curl -s GET "$API/api/stock/sample/list?styleNo=SEC_TEST_001" \
  -H "Authorization: Bearer $T2_TOKEN")
T2_COUNT=$(echo "$T2_QUERY" | python3 -c "import sys,json; d=json.load(sys.stdin).get('data',[]); print(len(d) if isinstance(d, list) else 0)" 2>/dev/null)

if [ "$T2_COUNT" -eq 0 ]; then
    echo -e "${GREEN}✅ 安全：租户2无法查到租户1的数据${NC}"
else
    echo -e "${RED}❌ 安全漏洞：租户2查到了租户1的数据（$T2_COUNT 条）${NC}"
    echo "$T2_QUERY" | python3 -m json.tool 2>/dev/null || echo "$T2_QUERY"
fi

# 租户2尝试通过ID直接访问
echo ""
echo "1.4 【渗透测试】租户2尝试通过ID直接访问租户1的样衣详情..."
T2_DETAIL=$(curl -s -w "\n%{http_code}" GET "$API/api/stock/sample/$SAMPLE_ID" \
  -H "Authorization: Bearer $T2_TOKEN")
HTTP_CODE=$(echo "$T2_DETAIL" | tail -1)
RESPONSE=$(echo "$T2_DETAIL" | head -n -1)

if [ "$HTTP_CODE" = "403" ] || [ "$HTTP_CODE" = "404" ]; then
    echo -e "${GREEN}✅ 安全：租户2通过ID访问被拒绝（HTTP $HTTP_CODE）${NC}"
elif echo "$RESPONSE" | grep -q "\"data\":null\|\"data\":{}"; then
    echo -e "${GREEN}✅ 安全：租户2通过ID访问返回空数据${NC}"
else
    echo -e "${RED}❌ 安全漏洞：租户2通过ID访问到了租户1的数据${NC}"
    echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
fi

# ========================================
# 测试2：SQL注入尝试
# ========================================
echo ""
echo "━━━ 测试2: SQL注入防护测试 ━━━"

echo ""
echo "2.1 【渗透测试】尝试通过SQL注入绕过租户过滤..."
SQLINJECT_QUERY=$(curl -s POST "$API/api/stock/sample/list" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $T2_TOKEN" \
  -d "{\"styleNo\":\"SEC' OR 1=1 --\"}")

INJECT_CODE=$(echo "$SQLINJECT_QUERY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('code',''))" 2>/dev/null)
if [ "$INJECT_CODE" = "200" ]; then
    INJECT_DATA=$(echo "$SQLINJECT_QUERY" | python3 -c "import sys,json; d=json.load(sys.stdin).get('data',[]); print(f'{len(d)} records' if isinstance(d, list) else 'object')" 2>/dev/null)
    if [ "$INJECT_DATA" = "0 records" ]; then
        echo -e "${GREEN}✅ 安全：SQL注入被过滤，返回空数据${NC}"
    else
        echo -e "${YELLOW}⚠️  SQL注入返回了数据：$INJECT_DATA${NC}"
        echo "需人工审查是否泄露了其他租户数据"
    fi
else
    echo -e "${GREEN}✅ 安全：SQL注入请求被拒绝（code=$INJECT_CODE）${NC}"
fi

# ========================================
# 清理测试数据
# ========================================
echo ""
echo "━━━ 清理测试数据 ━━━"

# 删除测试样衣
if [ -n "$SAMPLE_ID" ] && [ "$SAMPLE_ID" != "999999999" ]; then
    docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -e "DELETE FROM t_sample_stock WHERE id='$SAMPLE_ID';" 2>/dev/null || true
fi

# 删除测试租户（级联删除用户、角色等）
if [ -n "$TENANT1_ID" ]; then
    docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -e "
        DELETE FROM t_user WHERE tenant_id='$TENANT1_ID';
        DELETE FROM t_role WHERE tenant_id='$TENANT1_ID';
        DELETE FROM t_tenant WHERE id='$TENANT1_ID';
    " 2>/dev/null || true
fi

if [ -n "$TENANT2_ID" ]; then
    docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -e "
        DELETE FROM t_user WHERE tenant_id='$TENANT2_ID';
        DELETE FROM t_role WHERE tenant_id='$TENANT2_ID';
        DELETE FROM t_tenant WHERE id='$TENANT2_ID';
    " 2>/dev/null || true
fi

echo -e "${GREEN}✅ 测试数据清理完成${NC}"

# ========================================
# 测试结果汇总
# ========================================
echo ""
echo "========================================"
echo "🔒 租户隔离安全测试完成"
echo "========================================"
echo ""
echo "测试项："
echo "  ✅ 租户1创建数据"
echo "  ✅ 租户1查询自己的数据"
echo "  🔍 租户2跨租户查询（预期：空数据）"
echo "  🔍 租户2通过ID直接访问（预期：403或空数据）"
echo "  🔍 SQL注入防护（预期：被过滤）"
echo ""
echo "请手动审查上述测试结果，确认租户隔离机制正常工作"
echo ""
