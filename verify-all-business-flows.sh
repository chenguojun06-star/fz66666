#!/bin/bash

# 服装供应链系统 - 所有业务流程验证脚本
# 按照《业务流程完整操作手册.md》的顺序验证所有核心流程

set +e  # 允许单个测试失败但继续执行

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 测试结果统计
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
SKIPPED_TESTS=0

# 日志文件
LOG_FILE="verify-all-flows-$(date +%Y%m%d_%H%M%S).log"

# 打印分隔线
print_separator() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
}

# 打印测试标题
print_test_title() {
  local category=$1
  local title=$2
  echo -e "${BLUE}【$category】${NC} $title"
}

# 运行单个测试
run_test() {
  local script=$1
  local description=$2

  TOTAL_TESTS=$((TOTAL_TESTS + 1))

  if [ ! -f "$script" ]; then
    echo -e "${YELLOW}⚠️  跳过${NC}: $script (文件不存在)"
    SKIPPED_TESTS=$((SKIPPED_TESTS + 1))
    return
  fi

  echo -e "${BLUE}▶️  运行${NC}: $description"
  echo "脚本: $script"
  echo "开始时间: $(date '+%Y-%m-%d %H:%M:%S')"

  # 运行测试并捕获输出
  if ./"$script" >> "$LOG_FILE" 2>&1; then
    echo -e "${GREEN}✅ 通过${NC}: $description"
    PASSED_TESTS=$((PASSED_TESTS + 1))
  else
    echo -e "${RED}❌ 失败${NC}: $description"
    echo "   查看详细日志: tail -f $LOG_FILE"
    FAILED_TESTS=$((FAILED_TESTS + 1))
  fi

  echo "结束时间: $(date '+%Y-%m-%d %H:%M:%S')"
  echo ""
}

# 检查环境状态
check_environment() {
  print_separator
  print_test_title "环境检查" "验证开发环境状态"
  print_separator

  echo "1️⃣ 检查Docker容器..."
  if docker ps | grep -q fashion-mysql-simple; then
    echo -e "${GREEN}✅ 数据库容器运行中${NC}"
  else
    echo -e "${RED}❌ 数据库容器未运行${NC}"
    echo "   修复: ./deployment/db-manager.sh start"
    return 1
  fi

  echo ""
  echo "2️⃣ 检查后端服务..."
  local retries=0
  local max_retries=30

  while [ $retries -lt $max_retries ]; do
    if curl -s http://localhost:8088/actuator/health > /dev/null; then
      echo -e "${GREEN}✅ 后端服务运行中${NC}"
      break
    fi
    retries=$((retries + 1))
    if [ $retries -eq $max_retries ]; then
      echo -e "${RED}❌ 后端服务未响应${NC}"
      echo "   修复: ./dev-public.sh"
      return 1
    fi
    echo "   等待后端启动... ($retries/$max_retries)"
    sleep 2
  done

  echo ""
  echo "3️⃣ 检查前端服务..."
  if curl -s http://localhost:5173 > /dev/null; then
    echo -e "${GREEN}✅ 前端服务运行中${NC}"
  else
    echo -e "${YELLOW}⚠️  前端服务未响应（可能正常，测试主要依赖后端）${NC}"
  fi

  return 0
}

# 主测试流程
main() {
  echo "╔═══════════════════════════════════════════════════════════════╗"
  echo "║         服装供应链系统 - 所有业务流程自动化验证              ║"
  echo "╚═══════════════════════════════════════════════════════════════╝"
  echo ""
  echo "开始时间: $(date '+%Y-%m-%d %H:%M:%S')"
  echo "日志文件: $LOG_FILE"

  # 环境检查
  if ! check_environment; then
    echo ""
    echo -e "${RED}❌ 环境检查失败，无法继续测试${NC}"
    exit 1
  fi

  # ====================
  # 第一部分：核心业务流程测试（必须通过）
  # ====================
  print_separator
  print_test_title "核心业务流程" "这些测试验证端到端业务流程的完整性"
  print_separator

  run_test "test-warehouse-to-settlement.sh" \
    "大货入库到结算完整流程（14步：款式→订单→菲号→扫码→质检→入库→关单→对账）"

  run_test "test-complete-business-flow.sh" \
    "端到端完整业务流程（从款式创建到财务结算）"

  run_test "test-reconciliation-flow.sh" \
    "面料对账结算流程（采购→入库→对账→审批→付款）"

  run_test "test-finished-settlement-approve.sh" \
    "成品结算审批流程（核验→批准→付款）"

  run_test "test-all-settlement-flows.sh" \
    "所有结算流程综合测试"

  # ====================
  # 第二部分：生产管理模块
  # ====================
  print_separator
  print_test_title "生产管理模块" "订单创建、裁剪、扫码、进度跟踪"
  print_separator

  run_test "test-production-order-creator-tracking.sh" \
    "生产订单创建人追踪功能"

  run_test "test-order-creator-field.sh" \
    "订单创建人字段验证"

  run_test "test-data-flow-to-reconciliation.sh" \
    "数据流向对账验证（扫码→进度→关单→对账）"

  run_test "test-secondary-process-simple.sh" \
    "次要工序简单测试"

  # ====================
  # 第三部分：仓库管理模块
  # ====================
  print_separator
  print_test_title "仓库管理模块" "面辅料入库、成品入库、库存管理"
  print_separator

  run_test "test-material-inbound.sh" \
    "面辅料入库流程（采购→到货→入库→对账）"

  run_test "test-stock-check.sh" \
    "库存检查与验证"

  run_test "test-bom-stock-check.sh" \
    "BOM清单库存检查"

  run_test "test-warehouse-location-sync.sh" \
    "仓库位置同步测试"

  # ====================
  # 第四部分：款式管理模块
  # ====================
  print_separator
  print_test_title "款式管理模块" "款式创建、样衣开发、BOM配置"
  print_separator

  run_test "test-pattern-api.sh" \
    "款式API完整测试"

  run_test "test-pattern-production.sh" \
    "样衣生产流程测试（打板→试样→完成）"

  # ====================
  # 第五部分：财务管理模块
  # ====================
  print_separator
  print_test_title "财务管理模块" "对账、结算、审批、付款"
  print_separator

  run_test "test-procurement-progress.sh" \
    "采购进度跟踪"

  run_test "test-procurement-status.sh" \
    "采购状态管理"

  # ====================
  # 第六部分：数据中心与报表
  # ====================
  print_separator
  print_test_title "数据中心与报表" "仪表板、图表、逾期预警"
  print_separator

  run_test "test-dashboard-all.sh" \
    "仪表板所有数据验证"

  run_test "test-chart-api.sh" \
    "图表API测试"

  run_test "test-chart-data.sh" \
    "图表数据完整性验证"

  run_test "test-overdue-orders-api.sh" \
    "逾期订单预警API"

  # ====================
  # 第七部分：系统功能模块
  # ====================
  print_separator
  print_test_title "系统功能模块" "操作日志、权限、UI验证"
  print_separator

  run_test "test-operation-log-api.sh" \
    "操作日志API测试"

  run_test "test-factory-column.sh" \
    "工厂列显示验证"

  # ====================
  # 测试结果汇总
  # ====================
  print_separator
  echo "╔═══════════════════════════════════════════════════════════════╗"
  echo "║                      测试结果汇总                             ║"
  echo "╚═══════════════════════════════════════════════════════════════╝"
  echo ""
  echo "结束时间: $(date '+%Y-%m-%d %H:%M:%S')"
  echo ""
  echo "测试统计:"
  echo "  总计: $TOTAL_TESTS"
  echo -e "  ${GREEN}通过: $PASSED_TESTS${NC}"
  echo -e "  ${RED}失败: $FAILED_TESTS${NC}"
  echo -e "  ${YELLOW}跳过: $SKIPPED_TESTS${NC}"
  echo ""

  # 计算成功率
  if [ $TOTAL_TESTS -gt 0 ]; then
    SUCCESS_RATE=$((PASSED_TESTS * 100 / TOTAL_TESTS))
    echo "成功率: $SUCCESS_RATE%"
  fi

  echo ""
  echo "详细日志: $LOG_FILE"
  echo ""

  # 分类汇总
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "测试分类汇总:"
  echo ""
  echo "✅ 核心业务流程: 必须全部通过才能上线"
  echo "   - 大货入库到结算流程"
  echo "   - 端到端业务流程"
  echo "   - 对账结算流程"
  echo ""
  echo "✅ 功能模块测试: 确保各模块功能正常"
  echo "   - 生产管理（订单、扫码、进度）"
  echo "   - 仓库管理（入库、库存）"
  echo "   - 款式管理（款式、样衣）"
  echo "   - 财务管理（对账、结算）"
  echo ""
  echo "✅ 系统功能测试: 验证系统稳定性"
  echo "   - 数据中心（仪表板、图表）"
  echo "   - 系统功能（日志、权限）"
  echo ""

  # 返回状态
  if [ $FAILED_TESTS -gt 0 ]; then
    echo -e "${RED}⚠️  存在失败的测试，请检查日志并修复问题${NC}"
    exit 1
  else
    echo -e "${GREEN}🎉 所有测试通过！系统运行正常${NC}"
    exit 0
  fi
}

# 捕获中断信号
trap 'echo ""; echo -e "${YELLOW}测试被中断${NC}"; exit 130' INT TERM

# 运行主流程
main

