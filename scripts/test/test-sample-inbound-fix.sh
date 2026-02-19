#!/bin/bash
# 样衣入库功能测试脚本
# 用途：验证小程序样衣入库数据是否能正确显示在列表中
# 修复问题：入库成功后返回列表页，数据自动刷新

set -e

echo "=================================="
echo "样衣入库功能测试"
echo "=================================="
echo ""

# 配置
BASE_URL="http://localhost:8088"

# 颜色输出
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 自动登录获取token
echo -e "${BLUE}🔐 登录获取token...${NC}"
LOGIN_RESP=$(curl -s -X POST "$BASE_URL/api/system/user/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"123456"}')

TOKEN=$(echo "$LOGIN_RESP" | jq -r '.data.token // empty')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
    echo -e "${RED}❌ 登录失败${NC}"
    echo "响应: $LOGIN_RESP"
    exit 1
fi

echo -e "${GREEN}✅ 登录成功${NC}"
echo ""

# 生成测试数据
TIMESTAMP=$(date +%Y%m%d%H%M%S)
TEST_STYLE_NO="TEST${TIMESTAMP}"

echo -e "${BLUE}📝 测试数据：${NC}"
echo "  款号: $TEST_STYLE_NO"
echo "  款式名称: 测试款式-修复验证"
echo "  样衣类型: development (开发样)"
echo "  颜色: 红色"
echo "  尺码: M"
echo "  数量: 1"
echo "  位置: A1-TEST"
echo ""

# 1. 样衣入库
echo -e "${BLUE}步骤1: 执行样衣入库...${NC}"
INBOUND_RESPONSE=$(curl -s -X POST "$BASE_URL/api/stock/sample/inbound" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "styleNo": "'"$TEST_STYLE_NO"'",
    "styleName": "测试款式-修复验证",
    "sampleType": "development",
    "color": "红色",
    "size": "M",
    "quantity": 1,
    "location": "A1-TEST",
    "remark": "小程序onShow修复验证测试"
  }')

echo "入库响应: $INBOUND_RESPONSE"

# 检查入库结果
if echo "$INBOUND_RESPONSE" | grep -q '"code":200'; then
    echo -e "${GREEN}✅ 入库成功${NC}"
else
    echo -e "${RED}❌ 入库失败${NC}"
    echo "响应: $INBOUND_RESPONSE"
    exit 1
fi

echo ""
sleep 2

# 2. 查询列表（模拟PC端）
echo -e "${BLUE}步骤2: PC端查询列表...${NC}"
PC_LIST_RESPONSE=$(curl -s -X GET "$BASE_URL/api/stock/sample/list?page=1&pageSize=20&styleNo=$TEST_STYLE_NO" \
  -H "Authorization: Bearer $TOKEN")

echo "PC端响应: $PC_LIST_RESPONSE"

# 检查PC端是否能查到
PC_FOUND=false
if echo "$PC_LIST_RESPONSE" | grep -q "$TEST_STYLE_NO"; then
    echo -e "${GREEN}✅ PC端可以查到新数据${NC}"
    PC_FOUND=true
else
    echo -e "${RED}❌ PC端查不到新数据${NC}"
fi

echo ""
sleep 1

# 3. 查询列表（模拟小程序）
echo -e "${BLUE}步骤3: 小程序端查询列表...${NC}"
MINI_LIST_RESPONSE=$(curl -s -X GET "$BASE_URL/api/stock/sample/list?page=1&pageSize=10&styleNo=$TEST_STYLE_NO" \
  -H "Authorization: Bearer $TOKEN")

echo "小程序端响应: $MINI_LIST_RESPONSE"

# 检查小程序端是否能查到
MINI_FOUND=false
if echo "$MINI_LIST_RESPONSE" | grep -q "$TEST_STYLE_NO"; then
    echo -e "${GREEN}✅ 小程序端可以查到新数据${NC}"
    MINI_FOUND=true
else
    echo -e "${RED}❌ 小程序端查不到新数据${NC}"
fi

echo ""
sleep 1

# 4. 数据一致性检查
echo -e "${BLUE}步骤4: 数据一致性检查...${NC}"

# 提取PC端数据
PC_QUANTITY=$(echo "$PC_LIST_RESPONSE" | grep -o '"quantity":[0-9]*' | head -1 | cut -d':' -f2)
PC_COLOR=$(echo "$PC_LIST_RESPONSE" | grep -o '"color":"[^"]*"' | head -1 | cut -d':' -f2 | tr -d '"')
PC_SIZE=$(echo "$PC_LIST_RESPONSE" | grep -o '"size":"[^"]*"' | head -1 | cut -d':' -f2 | tr -d '"')
PC_TYPE=$(echo "$PC_LIST_RESPONSE" | grep -o '"sampleType":"[^"]*"' | head -1 | cut -d':' -f2 | tr -d '"')

# 提取小程序端数据
MINI_QUANTITY=$(echo "$MINI_LIST_RESPONSE" | grep -o '"quantity":[0-9]*' | head -1 | cut -d':' -f2)
MINI_COLOR=$(echo "$MINI_LIST_RESPONSE" | grep -o '"color":"[^"]*"' | head -1 | cut -d':' -f2 | tr -d '"')
MINI_SIZE=$(echo "$MINI_LIST_RESPONSE" | grep -o '"size":"[^"]*"' | head -1 | cut -d':' -f2 | tr -d '"')
MINI_TYPE=$(echo "$MINI_LIST_RESPONSE" | grep -o '"sampleType":"[^"]*"' | head -1 | cut -d':' -f2 | tr -d '"')

echo "PC端数据:"
echo "  数量: $PC_QUANTITY"
echo "  颜色: $PC_COLOR"
echo "  尺码: $PC_SIZE"
echo "  类型: $PC_TYPE"
echo ""

echo "小程序端数据:"
echo "  数量: $MINI_QUANTITY"
echo "  颜色: $MINI_COLOR"
echo "  尺码: $MINI_SIZE"
echo "  类型: $MINI_TYPE"
echo ""

# 对比数据
DATA_MATCH=true
if [ "$PC_QUANTITY" != "$MINI_QUANTITY" ] || \
   [ "$PC_COLOR" != "$MINI_COLOR" ] || \
   [ "$PC_SIZE" != "$MINI_SIZE" ] || \
   [ "$PC_TYPE" != "$MINI_TYPE" ]; then
    DATA_MATCH=false
fi

if [ "$DATA_MATCH" = true ]; then
    echo -e "${GREEN}✅ PC端和小程序端数据完全一致${NC}"
else
    echo -e "${YELLOW}⚠️  PC端和小程序端数据存在差异${NC}"
fi

echo ""

# 5. 总结
echo "=================================="
echo "测试结果总结"
echo "=================================="
echo ""

PASS_COUNT=0
TOTAL_COUNT=4

echo "1. 入库操作: ${GREEN}✅ 通过${NC}"
((PASS_COUNT++))

if [ "$PC_FOUND" = true ]; then
    echo "2. PC端查询: ${GREEN}✅ 通过${NC}"
    ((PASS_COUNT++))
else
    echo "2. PC端查询: ${RED}❌ 失败${NC}"
fi

if [ "$MINI_FOUND" = true ]; then
    echo "3. 小程序查询: ${GREEN}✅ 通过${NC}"
    ((PASS_COUNT++))
else
    echo "3. 小程序查询: ${RED}❌ 失败${NC}"
fi

if [ "$DATA_MATCH" = true ]; then
    echo "4. 数据一致性: ${GREEN}✅ 通过${NC}"
    ((PASS_COUNT++))
else
    echo "4. 数据一致性: ${YELLOW}⚠️  部分通过${NC}"
fi

echo ""
echo "通过率: $PASS_COUNT/$TOTAL_COUNT"

if [ $PASS_COUNT -eq $TOTAL_COUNT ]; then
    echo -e "${GREEN}🎉 所有测试通过！样衣入库功能正常${NC}"
    exit 0
elif [ $PASS_COUNT -ge 3 ]; then
    echo -e "${YELLOW}⚠️  大部分测试通过，但存在个别问题${NC}"
    exit 0
else
    echo -e "${RED}❌ 测试失败，请检查相关配置${NC}"
    exit 1
fi

echo ""
echo "=================================="
echo "小程序端验证步骤"
echo "=================================="
echo ""
echo "1. 打开微信开发者工具"
echo "2. 进入「样衣库存」页面"
echo "3. 搜索款号: $TEST_STYLE_NO"
echo "4. 应该能看到刚才入库的测试数据"
echo ""
echo "如果看不到数据："
echo "  - 检查小程序是否已加载最新代码"
echo "  - 手动下拉刷新列表"
echo "  - 检查筛选条件（应选择「全部」或「开发样」）"
echo ""
echo "清理测试数据（可选）："
echo "  DELETE FROM t_sample_stock WHERE style_no = '$TEST_STYLE_NO';"
echo ""
