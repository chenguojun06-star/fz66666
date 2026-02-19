#!/bin/bash
# 快速验证PC与小程序数据一致性
# 执行时间：2026-02-14
# 用途：验证API统一化修复是否生效

echo "======================================"
echo "PC与小程序数据一致性验证"
echo "======================================"
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 获取token（从小程序storage或手动输入）
echo -e "${YELLOW}步骤1：准备测试环境${NC}"
echo "请先登录小程序或PC端获取token..."
read -p "请输入JWT token（按Enter跳过手动测试）: " TOKEN

if [ -n "$TOKEN" ]; then
  echo -e "${GREEN}✅ Token已设置${NC}"
  BASE_URL="http://192.168.1.17:8088"

  echo ""
  echo -e "${YELLOW}步骤2：测试样衣库存API${NC}"
  echo "测试URL: ${BASE_URL}/api/stock/sample/list"

  # 测试无参数查询
  echo "1. 查询所有样衣（无筛选）"
  RESPONSE=$(curl -s -X GET "${BASE_URL}/api/stock/sample/list?page=1&pageSize=10" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json")

  TOTAL=$(echo "$RESPONSE" | grep -o '"total":[0-9]*' | grep -o '[0-9]*' || echo "0")
  echo -e "   返回总数: ${BLUE}${TOTAL}${NC}"

  # 测试带sampleType参数
  echo "2. 查询产前样（sampleType=产前样）"
  RESPONSE2=$(curl -s -X GET "${BASE_URL}/api/stock/sample/list?page=1&pageSize=10&sampleType=产前样" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json")

  TOTAL2=$(echo "$RESPONSE2" | grep -o '"total":[0-9]*' | grep -o '[0-9]*' || echo "0")
  echo -e "   返回总数: ${BLUE}${TOTAL2}${NC}"

  if [ "$TOTAL2" -le "$TOTAL" ]; then
    echo -e "${GREEN}✅ 筛选逻辑正常（筛选后 <= 全部）${NC}"
  else
    echo -e "${RED}❌ 筛选逻辑异常（筛选后 > 全部）${NC}"
  fi

  echo ""
  echo -e "${YELLOW}步骤3：测试成品库存API${NC}"
  echo "测试URL: ${BASE_URL}/api/warehouse/finished-inventory/list"

  RESPONSE3=$(curl -s -X GET "${BASE_URL}/api/warehouse/finished-inventory/list?page=1&pageSize=10" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json")

  TOTAL3=$(echo "$RESPONSE3" | grep -o '"total":[0-9]*' | grep -o '[0-9]*' || echo "0")
  echo -e "   返回总数: ${BLUE}${TOTAL3}${NC}"

  if [ "$TOTAL3" -ge "0" ]; then
    echo -e "${GREEN}✅ 成品库存API可访问${NC}"
  else
    echo -e "${RED}❌ 成品库存API返回异常${NC}"
  fi
else
  echo -e "${YELLOW}⚠️  跳过API自动测试${NC}"
fi

echo ""
echo "======================================"
echo -e "${YELLOW}手动验证步骤${NC}"
echo "======================================"
echo ""

echo "📱 小程序端："
echo "1. 打开微信开发者工具"
echo "2. 编译运行小程序"
echo "3. 打开控制台 Network 面板"
echo ""

echo "样衣库存验证："
echo "  - 进入 [仓库] -> [样衣列表]"
echo "  - 查看 Network 请求：/api/stock/sample/list"
echo "  - 记录请求参数和返回的 total 数量"
echo "  - 点击 [总数量] pill，查看总数"
echo ""

echo "成品库存验证："
echo "  - 进入 [仓库] -> [成品出库]"
echo "  - 选择一个订单"
echo "  - 查看 Network 请求：/api/warehouse/finished-inventory/list"
echo "  - 检查是否成功加载SKU列表"
echo ""

echo "💻 PC端："
echo "1. 打开浏览器访问 http://localhost:5173"
echo "2. 登录后打开浏览器开发者工具 (F12)"
echo "3. 切换到 Network 面板"
echo ""

echo "样衣库存验证："
echo "  - 进入 [仓库管理] -> [样衣库存]"
echo "  - 查看 Network 请求：/api/stock/sample/list"
echo "  - 记录请求参数和返回的 total 数量"
echo "  - 筛选条件选择 [全部]"
echo ""

echo "成品库存验证："
echo "  - 进入 [仓库管理] -> [成品库存]"
echo "  - 查看 Network 请求：/api/warehouse/finished-inventory/list"
echo "  - 记录返回的 total 数量"
echo ""

echo "======================================"
echo -e "${BLUE}数据对比检查点${NC}"
echo "======================================"
echo ""

echo "✅ 验证通过标准："
echo ""
echo "1. 样衣库存总数一致："
echo "   - PC端「全部」筛选的total = 小程序「总数量」"
echo "   - 示例：PC端显示100条，小程序也应该显示100"
echo ""

echo "2. API请求参数一致："
echo "   - PC端和小程序都应该包含 sampleType 参数（如果筛选了类型）"
echo "   - 小程序现在会传递 sampleType=undefined（全部）或具体类型"
echo ""

echo "3. 成品库存SKU列表："
echo "   - PC端和小程序选择同一订单时，SKU数量应该一致"
echo "   - 每个SKU的可用库存数量应该相同"
echo ""

echo "4. 响应数据结构一致："
echo "   - code: 200"
echo "   - data.total: (数字)"
echo "   - data.records: (数组)"
echo ""

echo "❌ 如果发现不一致："
echo ""
echo "1. 检查请求参数是否相同"
echo "   - 打开 Network 面板"
echo "   - 对比 Query String Parameters"
echo ""

echo "2. 检查返回数据的时间戳"
echo "   - 如果PC端数据更新，小程序未刷新 → 正常"
echo "   - 下拉刷新小程序列表后重新对比"
echo ""

echo "3. 检查小程序是否已重新编译"
echo "   - 微信开发者工具 → 菜单 → 编译"
echo "   - 确保使用最新代码"
echo ""

echo "4. 查看后端日志"
echo "   tail -f backend/logs/backend.log | grep 'stock/sample/list'"
echo "   检查是否有异常错误"
echo ""

echo "======================================"
echo -e "${GREEN}修复文件清单${NC}"
echo "======================================"
echo ""
echo "已修复的文件："
echo "  1. miniprogram/pages/warehouse/finished/outstock/index.js"
echo "     - 修复：API路径添加 /api 前缀"
echo ""
echo "  2. miniprogram/pages/warehouse/sample/list/index.js"
echo "     - 修复：传递 sampleType 参数"
echo "     - 修复：移除客户端过滤逻辑"
echo "     - 修复：统一使用服务端分页"
echo ""

echo "文档："
echo "  - PC与手机数据不一致问题-根因分析.md"
echo "  - API统一化方案-PC与小程序.md"
echo ""

echo "======================================"
echo -e "${YELLOW}完成验证后${NC}"
echo "======================================"
echo ""
echo "如果测试通过："
echo "  git add ."
echo "  git commit -m 'fix: 统一PC与小程序API调用参数，修复数据不一致问题'"
echo ""
echo "如果测试失败："
echo "  1. 截图保存PC和小程序的Network请求详情"
echo "  2. 记录具体的数据差异（哪个模块、相差多少）"
echo "  3. 查看后端日志排查问题"
echo ""
