#!/bin/bash

# 人员字段验证测试脚本
# 测试订单创建时对跟单员、纸样师的验证逻辑

BASE_URL="http://localhost:8088"
API_BASE="$BASE_URL/api"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "======================================"
echo "🧪 人员字段验证测试"
echo "======================================"
echo ""

# 1. 登录获取 token
echo "📝 步骤 1: 登录获取 token..."
LOGIN_RESPONSE=$(curl -s -X POST "$API_BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123"
  }')

TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.data.token // empty')

if [ -z "$TOKEN" ] || [ "$TOKEN" == "null" ]; then
  echo -e "${RED}❌ 登录失败${NC}"
  echo "响应: $LOGIN_RESPONSE"
  exit 1
fi

echo -e "${GREEN}✅ 登录成功${NC}"
echo "Token: ${TOKEN:0:20}..."
echo ""

# 2. 查询系统中的真实用户
echo "📝 步骤 2: 查询系统中的真实用户..."
USERS_RESPONSE=$(curl -s -X GET "$API_BASE/system/user/list" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json")

echo "用户列表响应: $USERS_RESPONSE" | jq '.'
REAL_USER_NAME=$(echo $USERS_RESPONSE | jq -r '.data.records[0].name // "系统管理员"')
echo -e "${GREEN}✅ 找到真实用户: $REAL_USER_NAME${NC}"
echo ""

# 3. 查询一个真实款式
echo "📝 步骤 3: 查询真实款式..."
STYLE_RESPONSE=$(curl -s -X POST "$API_BASE/style-info/list" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "size": 1
  }')

STYLE_ID=$(echo $STYLE_RESPONSE | jq -r '.data.records[0].id // empty')
STYLE_NO=$(echo $STYLE_RESPONSE | jq -r '.data.records[0].styleNo // empty')

if [ -z "$STYLE_ID" ]; then
  echo -e "${YELLOW}⚠️ 未找到款式，跳过测试${NC}"
  exit 0
fi

echo -e "${GREEN}✅ 找到款式: $STYLE_NO (ID: $STYLE_ID)${NC}"
echo ""

# 4. 测试场景1：使用系统中存在的用户（应该成功）
echo "======================================"
echo "📝 测试场景 1: 使用系统中存在的用户"
echo "======================================"

ORDER_1=$(cat <<EOF
{
  "styleId": "$STYLE_ID",
  "styleNo": "$STYLE_NO",
  "orderNo": "PO$(date +%Y%m%d%H%M%S)001",
  "orderQuantity": 100,
  "merchandiser": "$REAL_USER_NAME",
  "patternMaker": "$REAL_USER_NAME",
  "company": "测试公司",
  "productCategory": "测试品类",
  "factoryName": "测试工厂",
  "orderDetails": "[]"
}
EOF
)

echo "请求数据:"
echo "$ORDER_1" | jq '.'
echo ""

RESPONSE_1=$(curl -s -X POST "$API_BASE/production/order" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$ORDER_1")

echo "响应:"
echo "$RESPONSE_1" | jq '.'

CODE_1=$(echo $RESPONSE_1 | jq -r '.code')
if [ "$CODE_1" == "200" ]; then
  echo -e "${GREEN}✅ 测试通过：系统允许保存存在的用户${NC}"
  ORDER_ID_1=$(echo $RESPONSE_1 | jq -r '.data.id')
  echo "订单ID: $ORDER_ID_1"
else
  echo -e "${RED}❌ 测试失败：应该允许保存，但被拒绝${NC}"
  echo "错误信息: $(echo $RESPONSE_1 | jq -r '.message')"
fi
echo ""

# 5. 测试场景2：使用系统中不存在的用户（应该失败）
echo "======================================"
echo "📝 测试场景 2: 使用系统中不存在的用户"
echo "======================================"

FAKE_USER="不存在的用户$(date +%s)"

ORDER_2=$(cat <<EOF
{
  "styleId": "$STYLE_ID",
  "styleNo": "$STYLE_NO",
  "orderNo": "PO$(date +%Y%m%d%H%M%S)002",
  "orderQuantity": 100,
  "merchandiser": "$FAKE_USER",
  "patternMaker": "另一个不存在的纸样师",
  "company": "测试公司",
  "productCategory": "测试品类",
  "factoryName": "测试工厂",
  "orderDetails": "[]"
}
EOF
)

echo "请求数据:"
echo "$ORDER_2" | jq '.'
echo ""

RESPONSE_2=$(curl -s -X POST "$API_BASE/production/order" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$ORDER_2")

echo "响应:"
echo "$RESPONSE_2" | jq '.'

CODE_2=$(echo $RESPONSE_2 | jq -r '.code')
MESSAGE_2=$(echo $RESPONSE_2 | jq -r '.message')

if [ "$CODE_2" != "200" ] && [[ "$MESSAGE_2" == *"不存在"* ]]; then
  echo -e "${GREEN}✅ 测试通过：系统正确拒绝不存在的用户${NC}"
  echo "错误信息: $MESSAGE_2"
else
  echo -e "${RED}❌ 测试失败：应该拒绝保存，但被允许${NC}"
fi
echo ""

# 6. 测试场景3：只有跟单员不存在（应该失败）
echo "======================================"
echo "📝 测试场景 3: 只有跟单员不存在"
echo "======================================"

ORDER_3=$(cat <<EOF
{
  "styleId": "$STYLE_ID",
  "styleNo": "$STYLE_NO",
  "orderNo": "PO$(date +%Y%m%d%H%M%S)003",
  "orderQuantity": 100,
  "merchandiser": "不存在的跟单员$(date +%s)",
  "patternMaker": "$REAL_USER_NAME",
  "company": "测试公司",
  "productCategory": "测试品类",
  "factoryName": "测试工厂",
  "orderDetails": "[]"
}
EOF
)

echo "请求数据:"
echo "$ORDER_3" | jq '.'
echo ""

RESPONSE_3=$(curl -s -X POST "$API_BASE/production/order" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$ORDER_3")

echo "响应:"
echo "$RESPONSE_3" | jq '.'

CODE_3=$(echo $RESPONSE_3 | jq -r '.code')
MESSAGE_3=$(echo $RESPONSE_3 | jq -r '.message')

if [ "$CODE_3" != "200" ] && [[ "$MESSAGE_3" == *"跟单员"* ]]; then
  echo -e "${GREEN}✅ 测试通过：系统正确识别跟单员不存在${NC}"
  echo "错误信息: $MESSAGE_3"
else
  echo -e "${RED}❌ 测试失败：应该拒绝保存${NC}"
fi
echo ""

# 7. 测试场景4：人员字段为空（应该允许，因为非必填）
echo "======================================"
echo "📝 测试场景 4: 人员字段为空"
echo "======================================"

ORDER_4=$(cat <<EOF
{
  "styleId": "$STYLE_ID",
  "styleNo": "$STYLE_NO",
  "orderNo": "PO$(date +%Y%m%d%H%M%S)004",
  "orderQuantity": 100,
  "company": "测试公司",
  "productCategory": "测试品类",
  "factoryName": "测试工厂",
  "orderDetails": "[]"
}
EOF
)

echo "请求数据:"
echo "$ORDER_4" | jq '.'
echo ""

RESPONSE_4=$(curl -s -X POST "$API_BASE/production/order" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$ORDER_4")

echo "响应:"
echo "$RESPONSE_4" | jq '.'

CODE_4=$(echo $RESPONSE_4 | jq -r '.code')
if [ "$CODE_4" == "200" ]; then
  echo -e "${GREEN}✅ 测试通过：允许人员字段为空${NC}"
  ORDER_ID_4=$(echo $RESPONSE_4 | jq -r '.data.id')
  echo "订单ID: $ORDER_ID_4"
else
  echo -e "${YELLOW}⚠️ 测试失败：人员字段为空应该允许${NC}"
fi
echo ""

# 8. 清理测试数据
echo "======================================"
echo "📝 清理测试数据..."
echo "======================================"

if [ ! -z "${ORDER_ID_1:-}" ]; then
  echo "删除测试订单 1: $ORDER_ID_1"
  curl -s -X DELETE "$API_BASE/production/order/$ORDER_ID_1" \
    -H "Authorization: Bearer $TOKEN" > /dev/null
fi

if [ ! -z "${ORDER_ID_4:-}" ]; then
  echo "删除测试订单 4: $ORDER_ID_4"
  curl -s -X DELETE "$API_BASE/production/order/$ORDER_ID_4" \
    -H "Authorization: Bearer $TOKEN" > /dev/null
fi

echo -e "${GREEN}✅ 测试完成${NC}"
echo ""

echo "======================================"
echo "📊 测试总结"
echo "======================================"
echo "✅ 场景1：存在的用户 - 应该通过"
echo "✅ 场景2：多个不存在的用户 - 应该拒绝"
echo "✅ 场景3：跟单员不存在 - 应该拒绝"
echo "✅ 场景4：人员字段为空 - 应该允许"
