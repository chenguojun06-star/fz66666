#!/usr/bin/env bash

################################################################################
# 🔍 完整系统诊断与测试脚本
#
# 功能:
#   1️⃣  执行所有 12 个业务流程测试
#   2️⃣  生成详细的测试报告
#   3️⃣  发现并记录系统问题
#   4️⃣  回归分析系统健康度
#
# 用法: ./run-full-system-diagnostics.sh
#
# 前置条件: 手动运行 ./dev-public.sh 启动系统
#
################################################################################

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPORT_FILE="$ROOT_DIR/FULL_SYSTEM_TEST_REPORT_$(date +%Y%m%d_%H%M%S).md"
RESULTS_JSON="$ROOT_DIR/.test-results.json"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 测试统计
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
TEST_RESULTS=()

################################################################################
# 日志函数
################################################################################

log_info() {
  echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
  echo -e "${GREEN}✅ $1${NC}"
}

log_error() {
  echo -e "${RED}❌ $1${NC}"
}

log_warning() {
  echo -e "${YELLOW}⚠️  $1${NC}"
}

################################################################################
# 测试函数
################################################################################

check_system_ready() {
  log_info "检查系统就绪状态..."

  # 检查后端
  if ! curl -s http://localhost:8088/api/system/health > /dev/null 2>&1; then
    log_error "后端未就绪 (http://localhost:8088)"
    return 1
  fi
  log_success "后端已就绪"

  # 检查数据库
  if ! docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -e "SELECT 1" > /dev/null 2>&1; then
    log_error "数据库连接失败"
    return 1
  fi
  log_success "数据库已连接"

  return 0
}

run_test() {
  local test_name="$1"
  local script_path="$2"
  local test_no="$((TOTAL_TESTS + 1))"

  TOTAL_TESTS=$((TOTAL_TESTS + 1))

  log_info "[$test_no/12] 启动: $test_name"

  if [[ ! -f "$script_path" ]]; then
    log_error "测试脚本不存在: $script_path"
    TEST_RESULTS+=("[ $test_no ] ❌ $test_name - 脚本缺失")
    FAILED_TESTS=$((FAILED_TESTS + 1))
    return 1
  fi

  # 运行测试 (设置 30 秒超时)
  local test_output
  local test_status

  if timeout 30 bash "$script_path" > /tmp/test_output.log 2>&1; then
    test_status=0
    PASSED_TESTS=$((PASSED_TESTS + 1))
    log_success "[$test_no/12] 通过: $test_name"
    TEST_RESULTS+=("[ $test_no ] ✅ $test_name")
  else
    test_status=$?
    FAILED_TESTS=$((FAILED_TESTS + 1))
    log_error "[$test_no/12] 失败: $test_name (Exit code: $test_status)"
    TEST_RESULTS+=("[ $test_no ] ❌ $test_name (Exit $test_status)")

    # 记录错误日志
    if [[ -f /tmp/test_output.log && -s /tmp/test_output.log ]]; then
      local error_preview=$(head -10 /tmp/test_output.log | tr '\n' ' ')
      log_warning "错误: ${error_preview:0:100}..."
    fi
  fi

  sleep 1  # 测试间隔
  return $test_status
}

################################################################################
# 报告配置
################################################################################

generate_report() {
  log_info "生成测试报告..."

  {
    cat << 'EOF'
# 📊 完整系统测试报告

> **生成时间**:
> **系统**: 服装供应链管理系统
> **覆盖范围**: 12 个业务流程测试

---

## 📈 测试统计

EOF

    echo "| 指标 | 数值 | 状态 |"
    echo "|------|------|------|"
    echo "| 总测试数 | $TOTAL_TESTS | ⏳ |"
    echo "| 通过 | $PASSED_TESTS | ✅ |"
    echo "| 失败 | $FAILED_TESTS | ❌ |"

    if [[ $TOTAL_TESTS -gt 0 ]]; then
      local pass_rate=$((PASSED_TESTS * 100 / TOTAL_TESTS))
      echo "| 通过率 | ${pass_rate}% | $([ $pass_rate -ge 80 ] && echo '✅' || echo '❌') |"
    fi

    echo ""
    echo "---"
    echo ""
    echo "## 🧪 测试结果详情"
    echo ""

    for result in "${TEST_RESULTS[@]}"; do
      echo "$result"
    done

    echo ""
    echo "---"
    echo ""
    echo "## 🔴 关键问题汇总"
    echo ""

    if [[ $FAILED_TESTS -gt 0 ]]; then
      echo "### 失败的测试："
      echo ""
      for result in "${TEST_RESULTS[@]}"; do
        if [[ $result == *"❌"* ]]; then
          echo "- $result"
        fi
      done
    else
      echo "🎉 **所有测试都通过了！**"
    fi

  } | tee "$REPORT_FILE"
}

################################################################################
# 主程序
################################################################################

main() {
  clear

  echo -e "${BLUE}"
  echo "╔════════════════════════════════════════════════════════════════╗"
  echo "║           🔍 完整系统诊断与测试                                ║"
  echo "║           Full System Diagnostics & Testing Suite              ║"
  echo "╚════════════════════════════════════════════════════════════════╝"
  echo -e "${NC}"
  echo ""

  # 检查系统就绪
  if ! check_system_ready; then
    log_error "系统未就绪，无法开始测试"
    log_info "请先运行: ./dev-public.sh"
    exit 1
  fi

  echo ""
  log_info "开始执行 12 个测试脚本..."
  echo ""

  # 运行所有测试
  run_test "订单创建追踪" "$ROOT_DIR/test-production-order-creator-tracking.sh" || true
  run_test "面料入库" "$ROOT_DIR/test-material-inbound.sh" || true
  run_test "库存检查" "$ROOT_DIR/test-stock-check.sh" || true
  run_test "成品结算审批" "$ROOT_DIR/test-finished-settlement-approve.sh" || true
  run_test "BOM库存检查" "$ROOT_DIR/test-bom-stock-check.sh" || true
  run_test "数据流向对账" "$ROOT_DIR/test-data-flow-to-reconciliation.sh" || true
  run_test "采购任务修复" "$ROOT_DIR/test-procurement-task-fix.sh" || true
  run_test "扫码反馈" "$ROOT_DIR/test-scan-feedback.sh" || true
  run_test "搜索功能" "$ROOT_DIR/test-search-functionality.sh" || true
  run_test "搜索跳转" "$ROOT_DIR/test-search-jump-feature.sh" || true
  run_test "逾期订单功能" "$ROOT_DIR/test-overdue-order-feature.sh" || true
  run_test "仪表板全量" "$ROOT_DIR/test-dashboard-all.sh" || true

  echo ""
  echo "╔════════════════════════════════════════════════════════════════╗"
  echo "║                    🏁 测试执行完成                              ║"
  echo "╚════════════════════════════════════════════════════════════════╝"
  echo ""

  # 输出总结
  local pass_rate=0
  if [[ $TOTAL_TESTS -gt 0 ]]; then
    pass_rate=$((PASSED_TESTS * 100 / TOTAL_TESTS))
  fi

  log_info "测试总结:"
  echo "  - 总数: $TOTAL_TESTS"
  echo "  - 通过: $PASSED_TESTS"
  echo "  - 失败: $FAILED_TESTS"
  echo "  - 通过率: ${pass_rate}%"
  echo ""

  # 生成报告
  generate_report

  log_success "完整报告已保存到: $REPORT_FILE"

  # 返回状态码
  if [[ $FAILED_TESTS -eq 0 ]]; then
    log_success "🎉 全部测试通过！系统可安全部署"
    exit 0
  else
    log_error "有 $FAILED_TESTS 个测试失败，请查看报告"
    exit 1
  fi
}

# 运行主程序
main "$@"
