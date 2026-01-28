#!/bin/bash

# 样板生产API测试脚本（包含完整的登录流程）
set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

API_BASE="http://localhost:8088"

echo "========================================"
echo "  样板生产API完整测试（含登录）"
echo "========================================"
echo ""

# Step 1: 登录获取token
echo -e "${YELLOW}[1/4]${NC} 登录系统获取token..."

LOGIN_RESPONSE=$(curl -s -X POST "${API_BASE}/api/system/user/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123"
  }')

# 提取token（假设返回格式为 {"code":200,"data":{"token":"xxx"}）
TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*"' | sed 's/"token":"\(.*\)"/\1/' || echo "")

if [ -z "$TOKEN" ]; then
  echo -e "${RED}✗${NC} 登录失败！请检查用户名密码"
  echo "响应: $LOGIN_RESPONSE"
  echo ""
  echo "提示：如果admin账号不存在，请在前端登录页面先创建管理员账号"
  exit 1
fi

echo -e "${GREEN}✓${NC} 登录成功"
echo "   Token: ${TOKEN:0:20}..."
echo ""

# Step 2: 测试获取样板生产列表
echo -e "${YELLOW}[2/4]${NC} 测试获取样板生产列表..."

LIST_RESPONSE=$(curl -s -X GET "${API_BASE}/api/production/pattern/list?page=1&pageSize=10" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json")

# 检查是否成功
if echo "$LIST_RESPONSE" | grep -q '"code":200'; then
  echo -e "${GREEN}✓${NC} API调用成功"
  TOTAL=$(echo "$LIST_RESPONSE" | grep -o '"total":[0-9]*' | sed 's/"total"://')
  echo "   记录总数: ${TOTAL:-0}"
else
  echo -e "${RED}✗${NC} API调用失败"
  echo "$LIST_RESPONSE"
  exit 1
fi
echo ""

# Step 3: 测试领取样板功能（如果有PENDING记录）
echo -e "${YELLOW}[3/4]${NC} 测试领取样板功能..."

# 获取第一条PENDING记录的ID
PENDING_ID=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -sN \
  -e "SELECT id FROM t_pattern_production WHERE status='PENDING' AND delete_flag=0 LIMIT 1;" 2>/dev/null || echo "")

if [ -z "$PENDING_ID" ]; then
  echo -e "${YELLOW}⚠${NC} 没有待领取的样板记录，跳过测试"
else
  RECEIVE_RESPONSE=$(curl -s -X POST "${API_BASE}/api/production/pattern/${PENDING_ID}/receive" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json")

  if echo "$RECEIVE_RESPONSE" | grep -q '"code":200'; then
    echo -e "${GREEN}✓${NC} 领取成功"
  else
    echo -e "${RED}✗${NC} 领取失败"
    echo "$RECEIVE_RESPONSE"
  fi
fi
echo ""

# Step 4: 测试更新进度功能
echo -e "${YELLOW}[4/4]${NC} 测试更新进度功能..."

# 获取第一条IN_PROGRESS记录的ID
PROGRESS_ID=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -sN \
  -e "SELECT id FROM t_pattern_production WHERE status='IN_PROGRESS' AND delete_flag=0 LIMIT 1;" 2>/dev/null || echo "")

if [ -z "$PROGRESS_ID" ]; then
  echo -e "${YELLOW}⚠${NC} 没有进行中的样板记录，跳过测试"
else
  UPDATE_RESPONSE=$(curl -s -X POST "${API_BASE}/api/production/pattern/${PROGRESS_ID}/progress" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{
      "cutting": 50,
      "sewing": 30,
      "ironing": 0,
      "quality": 0,
      "secondary": 0,
      "packaging": 0
    }')

  if echo "$UPDATE_RESPONSE" | grep -q '"code":200'; then
    echo -e "${GREEN}✓${NC} 进度更新成功"
  else
    echo -e "${RED}✗${NC} 进度更新失败"
    echo "$UPDATE_RESPONSE"
  fi
fi
echo ""

echo "========================================"
echo -e "${GREEN}✓ API测试完成${NC}"
echo "========================================"
echo ""
echo "提示：如果前端依然显示404错误，请："
echo "1. 确保已在浏览器中登录系统"
echo "2. 检查浏览器localStorage中是否有authToken"
echo "3. 刷新页面重新加载token"
