#!/bin/bash

###############################################################################
# 统一测试运行脚本 - 自动清理版本
# 运行所有主要测试脚本，测试通过后自动清理数据
# 创建时间：2026-02-15
###############################################################################

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# 测试脚本列表
TESTS=(
    "test-complete-business-flow.sh|完整业务流程"
    "test-production-order-creator-tracking.sh|生产订单创建人追踪"
    "test-data-flow-to-reconciliation.sh|数据流向对账"
    "test-finished-settlement-approve.sh|成品结算审批"
    "test-stock-check.sh|库存检查"
    "test-material-inbound.sh|面料入库"
    "test-bom-stock-check.sh|BOM库存检查"
)

PASSED=0
FAILED=0
SKIPPED=0

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         服装供应链系统 - 自动化测试套件（含数据清理）          ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo "测试时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "测试数量: ${#TESTS[@]} 个"
echo ""

for test_item in "${TESTS[@]}"; do
    IFS='|' read -r script description <<< "$test_item"

    if [ ! -f "$script" ]; then
        echo -e "${YELLOW}⊘ ${description}${NC}"
        echo "  文件不存在: $script"
        ((SKIPPED++))
        continue
    fi

    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}▶ 运行: ${description}${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    # 运行测试
    if bash "$script" > "/tmp/${script}.log" 2>&1; then
        echo -e "${GREEN}✅ ${description} - 通过${NC}"
        ((PASSED++))
    else
        echo -e "${RED}❌ ${description} - 失败${NC}"
        echo "  查看日志: /tmp/${script}.log"
        # 显示最后10行日志
        echo -e "${YELLOW}  最后10行输出:${NC}"
        tail -10 "/tmp/${script}.log" | sed 's/^/    /'
        ((FAILED++))
    fi

    echo ""
done

# 测试总结
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}测试总结${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  ✅ 通过: ${GREEN}${PASSED}${NC} 个"
echo -e "  ❌ 失败: ${RED}${FAILED}${NC} 个"
echo -e "  ⊘ 跳过: ${YELLOW}${SKIPPED}${NC} 个"
echo -e "  📊 总计: $((PASSED + FAILED + SKIPPED)) 个"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                 🎉 所有测试通过！                             ║${NC}"
    echo -e "${GREEN}║             测试数据已在各脚本中自动清理                       ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
    exit 0
else
    echo -e "${YELLOW}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${YELLOW}║            ⚠️  部分测试失败，请检查日志                       ║${NC}"
    echo -e "${YELLOW}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "查看详细日志："
    echo "  ls -lh /tmp/test-*.log"
    exit 1
fi
