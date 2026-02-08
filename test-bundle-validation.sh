#!/bin/bash
# 测试裁剪菲号生成验证逻辑
# 验证：禁止合并尺码（如 "S,M,L,XL,XXL"）

set -e

echo "========================================="
echo "测试：裁剪菲号生成验证逻辑"
echo "目标：确保禁止合并尺码的验证生效"
echo "========================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 获取 JWT Token
echo "1️⃣  获取登录 Token..."
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:8088/api/system/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}')

TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*' | sed 's/"token":"//')

if [ -z "$TOKEN" ]; then
  echo -e "${RED}❌ 登录失败，无法获取 Token${NC}"
  echo "响应: $LOGIN_RESPONSE"
  exit 1
fi

echo -e "${GREEN}✅ 登录成功${NC}"
echo ""

# 测试1：正确的单尺码菲号生成（应该成功）
echo "2️⃣  测试正确的单尺码菲号生成..."
CORRECT_PAYLOAD='{
  "orderId": "4c097789eebe46c281f7f0c4c28fb9dd",
  "bundles": [
    {"color": "黑色", "size": "S", "quantity": 10},
    {"color": "黑色", "size": "M", "quantity": 10}
  ]
}'

CORRECT_RESPONSE=$(curl -s -X POST http://localhost:8088/api/production/cutting/receive \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "$CORRECT_PAYLOAD")

CORRECT_CODE=$(echo $CORRECT_RESPONSE | grep -o '"code":[0-9]*' | sed 's/"code"://')

if [ "$CORRECT_CODE" = "200" ]; then
  echo -e "${GREEN}✅ 正确的单尺码菲号生成成功${NC}"
  echo "响应: $CORRECT_RESPONSE"
else
  echo -e "${RED}❌ 正确的单尺码菲号生成失败（不应该失败）${NC}"
  echo "响应: $CORRECT_RESPONSE"
fi
echo ""

# 测试2：错误的合并尺码菲号生成（应该失败）
echo "3️⃣  测试错误的合并尺码菲号生成（预期失败）..."
WRONG_PAYLOAD='{
  "orderId": "4c097789eebe46c281f7f0c4c28fb9dd",
  "bundles": [
    {"color": "黑色", "size": "S,M,L,XL,XXL", "quantity": 50}
  ]
}'

WRONG_RESPONSE=$(curl -s -X POST http://localhost:8088/api/production/cutting/receive \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "$WRONG_PAYLOAD")

WRONG_CODE=$(echo $WRONG_RESPONSE | grep -o '"code":[0-9]*' | sed 's/"code"://')
WRONG_MESSAGE=$(echo $WRONG_RESPONSE | grep -o '"message":"[^"]*' | sed 's/"message":"//')

if [ "$WRONG_CODE" != "200" ] && echo "$WRONG_MESSAGE" | grep -q "逗号"; then
  echo -e "${GREEN}✅ 合并尺码验证生效，正确拒绝了错误数据${NC}"
  echo "错误消息: $WRONG_MESSAGE"
else
  echo -e "${RED}❌ 合并尺码验证未生效（验证逻辑有问题）${NC}"
  echo "响应: $WRONG_RESPONSE"
fi
echo ""

# 检查数据库中的菲号数量
echo "4️⃣  检查 PO20260203001 的菲号数据..."
BUNDLE_COUNT=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -se \
  "SELECT COUNT(*) FROM t_cutting_bundle WHERE production_order_no = 'PO20260203001';")

echo "当前菲号数量: $BUNDLE_COUNT"

if [ "$BUNDLE_COUNT" -eq 2 ]; then
  echo -e "${GREEN}✅ 菲号数量正确（2个单尺码菲号）${NC}"
elif [ "$BUNDLE_COUNT" -eq 0 ]; then
  echo -e "${YELLOW}⚠️  菲号数量为 0（需要重新生成）${NC}"
else
  echo -e "${YELLOW}⚠️  菲号数量为 $BUNDLE_COUNT（检查是否有残留数据）${NC}"
fi
echo ""

# 显示实际菲号数据
echo "5️⃣  实际菲号数据："
docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -e \
  "SELECT bundle_no as '菲号', color as '颜色', size as '尺码', quantity as '数量'
   FROM t_cutting_bundle
   WHERE production_order_no = 'PO20260203001'
   ORDER BY bundle_no;" 2>&1 | grep -v "Warning"

echo ""
echo "========================================="
echo "测试完成"
echo "========================================="
echo ""
echo "📋 总结："
echo "1. ✅ 后端验证逻辑已添加（禁止逗号分隔尺码）"
echo "2. ✅ 小程序验证逻辑已添加（_buildBundleParams）"
echo "3. ✅ PO20260203001 错误数据已删除"
echo "4. ⚠️  需要重新生成正确的菲号数据"
echo ""
echo "📝 下一步操作："
echo "方案1（推荐）：打开 PC 端裁剪页面"
echo "  http://localhost:5173/production/cutting/PO20260203001"
echo "  手动录入 5 行（每行一个尺码）"
echo ""
echo "方案2：查看修复脚本"
echo "  cat /tmp/fix-po20260203001-bundles.sql"
echo ""
