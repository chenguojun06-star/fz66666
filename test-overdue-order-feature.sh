#!/bin/bash
# 小程序延期订单功能测试脚本
# 用于验证延期订单归纳与提醒功能是否正常工作

echo "========================================"
echo "📱 小程序延期订单功能测试"
echo "========================================"
echo ""

BASE_DIR="/Volumes/macoo2/Users/guojunmini4/Documents/服装66666/miniprogram"

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试计数器
PASS=0
FAIL=0

# 测试函数
test_file() {
  local file=$1
  local desc=$2

  if [ -f "$BASE_DIR/$file" ]; then
    echo -e "${GREEN}✅ PASS${NC} - $desc"
    ((PASS++))
  else
    echo -e "${RED}❌ FAIL${NC} - $desc (文件不存在: $file)"
    ((FAIL++))
  fi
}

test_content() {
  local file=$1
  local pattern=$2
  local desc=$3

  if grep -q "$pattern" "$BASE_DIR/$file" 2>/dev/null; then
    echo -e "${GREEN}✅ PASS${NC} - $desc"
    ((PASS++))
  else
    echo -e "${RED}❌ FAIL${NC} - $desc (未找到: $pattern)"
    ((FAIL++))
  fi
}

echo "=== 1. 核心文件检查 ==="
echo ""

test_file "components/floating-bell/overdueOrderLoader.js" "延期订单加载器文件存在"
test_file "components/floating-bell/index.js" "铃铛组件主文件存在"
test_file "components/floating-bell/bellTaskActions.js" "任务操作文件存在"
test_file "pages/work/index.js" "工作页面主文件存在"

echo ""
echo "=== 2. 功能代码检查 ==="
echo ""

test_content "components/floating-bell/overdueOrderLoader.js" "loadOverdueOrders" "延期订单加载函数"
test_content "components/floating-bell/overdueOrderLoader.js" "calculateOverdueDays" "超期天数计算函数"
test_content "components/floating-bell/overdueOrderLoader.js" "summarizeOverdueOrders" "延期统计函数"
test_content "components/floating-bell/bellTaskLoader.js" "loadOverdueOrders" "铃铛加载器集成延期订单"
test_content "components/floating-bell/bellTaskActions.js" "handleOverdueOrder" "延期订单跳转处理"
test_content "pages/work/index.js" "highlightOrderNo" "订单高亮功能"
test_content "pages/work/index.js" "sort.*createdAt" "订单时间排序"

echo ""
echo "=== 3. UI组件检查 ==="
echo ""

test_content "components/floating-bell/index.wxml" "overdueOrders" "铃铛UI延期订单部分"
test_content "components/floating-bell/index.wxml" "overdueSummary" "延期订单统计卡片"
test_content "components/floating-bell/index.wxml" "overdue-badge" "延期标签"
test_content "components/floating-bell/index.wxss" "overdue-summary" "延期订单统计样式"
test_content "components/floating-bell/index.wxss" "overdue-item" "延期订单卡片样式"
test_content "pages/work/index.wxml" "list-item-highlight" "订单高亮class"
test_content "pages/work/index.wxml" "overdue-indicator" "延期标识器"
test_content "pages/work/index.wxss" "list-item-highlight" "订单高亮样式"
test_content "pages/work/index.wxss" "highlight-pulse" "高亮呼吸动画"

echo ""
echo "=== 4. 数据流检查 ==="
echo ""

test_content "components/floating-bell/index.js" "overdueOrders: \\[\\]" "组件数据定义"
test_content "components/floating-bell/index.js" "overdueSummary: {}" "组件统计数据定义"
test_content "components/floating-bell/bellTaskActions.js" "case 'overdue':" "跳转路由注册"

echo ""
echo "=== 5. 关键逻辑检查 ==="
echo ""

# 检查延期订单分级逻辑
if grep -q "overdueDays > 7" "$BASE_DIR/components/floating-bell/overdueOrderLoader.js" 2>/dev/null; then
  echo -e "${GREEN}✅ PASS${NC} - 严重延期判断逻辑 (>7天)"
  ((PASS++))
else
  echo -e "${RED}❌ FAIL${NC} - 严重延期判断逻辑缺失"
  ((FAIL++))
fi

if grep -q "overdueDays > 3" "$BASE_DIR/components/floating-bell/overdueOrderLoader.js" 2>/dev/null; then
  echo -e "${GREEN}✅ PASS${NC} - 紧急延期判断逻辑 (4-7天)"
  ((PASS++))
else
  echo -e "${RED}❌ FAIL${NC} - 紧急延期判断逻辑缺失"
  ((FAIL++))
fi

# 检查跳转逻辑
if grep -q "highlight_order_no" "$BASE_DIR/components/floating-bell/bellTaskActions.js" 2>/dev/null; then
  echo -e "${GREEN}✅ PASS${NC} - 订单高亮存储逻辑"
  ((PASS++))
else
  echo -e "${RED}❌ FAIL${NC} - 订单高亮存储逻辑缺失"
  ((FAIL++))
fi

if grep -q "switchTab.*pages/work/index" "$BASE_DIR/components/floating-bell/bellTaskActions.js" 2>/dev/null; then
  echo -e "${GREEN}✅ PASS${NC} - 跳转到工作页面逻辑"
  ((PASS++))
else
  echo -e "${RED}❌ FAIL${NC} - 跳转逻辑缺失"
  ((FAIL++))
fi

# 检查排序逻辑
if grep -q "timeB - timeA" "$BASE_DIR/pages/work/index.js" 2>/dev/null; then
  echo -e "${GREEN}✅ PASS${NC} - 订单时间降序排序（新→老）"
  ((PASS++))
else
  echo -e "${RED}❌ FAIL${NC} - 订单排序逻辑缺失或错误"
  ((FAIL++))
fi

echo ""
echo "=== 6. 视觉效果检查 ==="
echo ""

# 检查颜色定义
CRITICAL_COLOR_COUNT=$(grep -c "#ef4444\|#fee2e2\|#dc2626" "$BASE_DIR/components/floating-bell/index.wxss" 2>/dev/null || echo "0")
if [ "$CRITICAL_COLOR_COUNT" -ge 3 ]; then
  echo -e "${GREEN}✅ PASS${NC} - 严重延期颜色样式完整"
  ((PASS++))
else
  echo -e "${YELLOW}⚠️  WARN${NC} - 严重延期颜色样式可能不完整 (找到 $CRITICAL_COLOR_COUNT 处)"
fi

URGENT_COLOR_COUNT=$(grep -c "#f97316\|#fed7aa\|#ea580c" "$BASE_DIR/components/floating-bell/index.wxss" 2>/dev/null || echo "0")
if [ "$URGENT_COLOR_COUNT" -ge 3 ]; then
  echo -e "${GREEN}✅ PASS${NC} - 紧急延期颜色样式完整"
  ((PASS++))
else
  echo -e "${YELLOW}⚠️  WARN${NC} - 紧急延期颜色样式可能不完整 (找到 $URGENT_COLOR_COUNT 处)"
fi

# 检查动画
if grep -q "@keyframes highlight-pulse" "$BASE_DIR/pages/work/index.wxss" 2>/dev/null; then
  echo -e "${GREEN}✅ PASS${NC} - 高亮呼吸动画定义"
  ((PASS++))
else
  echo -e "${RED}❌ FAIL${NC} - 高亮动画缺失"
  ((FAIL++))
fi

echo ""
echo "========================================"
echo "📊 测试结果汇总"
echo "========================================"
echo ""
echo -e "${GREEN}✅ 通过: $PASS${NC}"
echo -e "${RED}❌ 失败: $FAIL${NC}"
echo ""

TOTAL=$((PASS + FAIL))
if [ $TOTAL -gt 0 ]; then
  PERCENTAGE=$((PASS * 100 / TOTAL))
  echo "通过率: $PERCENTAGE%"
  echo ""

  if [ $PERCENTAGE -eq 100 ]; then
    echo -e "${GREEN}🎉 所有测试通过！功能实现完整。${NC}"
    echo ""
    echo "📱 下一步："
    echo "1. 在微信开发者工具中打开小程序"
    echo "2. 点击右上角铃铛按钮"
    echo "3. 查看是否显示"延期订单"部分"
    echo "4. 点击任意延期订单测试跳转"
    echo "5. 在工作页面检查订单是否高亮且按时间排序"
  elif [ $PERCENTAGE -ge 80 ]; then
    echo -e "${YELLOW}⚠️  大部分测试通过，但有少量问题需要修复。${NC}"
  else
    echo -e "${RED}❌ 测试失败较多，请检查代码实现。${NC}"
  fi
else
  echo -e "${RED}❌ 无法执行测试！${NC}"
fi

echo ""
echo "========================================"
echo "📄 详细日志"
echo "========================================"
echo ""
echo "测试时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "测试目录: $BASE_DIR"
echo ""

# 生成测试报告
REPORT_FILE="/Volumes/macoo2/Users/guojunmini4/Documents/服装66666/小程序延期订单功能测试报告.txt"
{
  echo "小程序延期订单功能测试报告"
  echo "======================================"
  echo ""
  echo "测试时间: $(date '+%Y-%m-%d %H:%M:%S')"
  echo "通过: $PASS | 失败: $FAIL | 通过率: ${PERCENTAGE}%"
  echo ""
  echo "测试详情请查看终端输出"
} > "$REPORT_FILE"

echo "测试报告已保存到: $REPORT_FILE"
echo ""

exit $FAIL
