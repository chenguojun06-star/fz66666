#!/bin/bash

# P2测试脚本批量验证工具
# 生成时间: 2026-02-15

set -e

REPORT_FILE="/tmp/p2_validation_report_$(date +%Y%m%d_%H%M%S).md"
PASSED=0
FAILED=0
SKIPPED=0

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# P2测试脚本列表 (21个)
P2_TESTS=(
    "test-all-tenants-e2e.sh"
    "test-api-consistency.sh"
    "test-bom-stock-check.sh"
    "test-business-flow.sh"
    "test-complete-business-flow-integration.sh"
    "test-comprehensive-validation.sh"
    "test-dashboard-all.sh"
    "test-e2e-complete-business-flow.sh"
    "test-error-message-optimization.sh"
    "test-full-material-flow.sh"
    "test-material-full-flow.sh"
    "test-order-data-fix.sh"
    "test-order-data-integrity.sh"
    "test-overdue-order-feature.sh"
    "test-procurement-task-fix.sh"
    "test-sample-inbound-fix.sh"
    "test-scan-feedback.sh"
    "test-search-functionality.sh"
    "test-search-jump-feature.sh"
    "test-stock-check.sh"
    "test-tenant-data-integrity.sh"
)

echo "# P2测试验证报告" > "$REPORT_FILE"
echo "**生成时间**: $(date '+%Y-%m-%d %H:%M:%S')" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "## 测试执行摘要" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   P2测试批量验证开始 (21个脚本)${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# 开始测试
for script in "${P2_TESTS[@]}"; do
    echo -e "${YELLOW}[$(date '+%H:%M:%S')] 测试: $script${NC}"

    if [ ! -f "$script" ]; then
        echo -e "${RED}  ✗ 文件不存在${NC}"
        echo "| $script | ❌ 文件不存在 | - | -" >> "$REPORT_FILE"
        ((SKIPPED++))
        continue
    fi

    # 运行测试并捕获输出
    START_TIME=$(date +%s)
    if timeout 120 bash "$script" > "/tmp/${script}.log" 2>&1; then
        END_TIME=$(date +%s)
        DURATION=$((END_TIME - START_TIME))

        # 检查日志中是否有关键成功标志
        if grep -qE "✅|PASS|成功|全部通过" "/tmp/${script}.log"; then
            echo -e "${GREEN}  ✓ 通过 (${DURATION}s)${NC}"
            echo "| $script | ✅ 通过 | ${DURATION}s | - |" >> "$REPORT_FILE"
            ((PASSED++))
        else
            echo -e "${YELLOW}  ⚠ 完成但无明确成功标志 (${DURATION}s)${NC}"
            echo "| $script | ⚠️ 需人工确认 | ${DURATION}s | 无明确成功标志 |" >> "$REPORT_FILE"
            ((SKIPPED++))
        fi
    else
        EXIT_CODE=$?
        END_TIME=$(date +%s)
        DURATION=$((END_TIME - START_TIME))

        # 提取错误信息
        ERROR_MSG=$(tail -5 "/tmp/${script}.log" | tr '\n' ' ' | cut -c1-80)

        if [ $EXIT_CODE -eq 124 ]; then
            echo -e "${RED}  ✗ 超时 (>120s)${NC}"
            echo "| $script | ❌ 超时 | >120s | 执行超过2分钟 |" >> "$REPORT_FILE"
        else
            echo -e "${RED}  ✗ 失败 (退出码: $EXIT_CODE, ${DURATION}s)${NC}"
            echo "| $script | ❌ 失败 | ${DURATION}s | 退出码: $EXIT_CODE |" >> "$REPORT_FILE"
        fi
        ((FAILED++))
    fi

    echo ""
done

# 生成统计摘要
echo "" >> "$REPORT_FILE"
echo "## 详细结果" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "| 脚本 | 状态 | 耗时 | 备注 |" >> "$REPORT_FILE"
echo "|------|------|------|------|" >> "$REPORT_FILE"

# 将临时结果追加到报告
cat "$REPORT_FILE" > "${REPORT_FILE}.tmp"
grep "^| test-" "${REPORT_FILE}.tmp" >> "$REPORT_FILE" || true

# 插入统计信息到开头
{
    head -4 "${REPORT_FILE}.tmp"
    echo "- ✅ **通过**: $PASSED"
    echo "- ❌ **失败**: $FAILED"
    echo "- ⚠️ **需确认**: $SKIPPED"
    echo "- 📊 **总计**: ${#P2_TESTS[@]}"
    echo "- 📈 **通过率**: $(awk "BEGIN {printf \"%.1f%%\", ($PASSED / ${#P2_TESTS[@]}) * 100}")"
    echo ""
    tail -n +5 "${REPORT_FILE}.tmp"
} > "$REPORT_FILE"

rm "${REPORT_FILE}.tmp"

# 终端输出统计
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   测试完成${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "✅ 通过:   ${GREEN}$PASSED${NC}"
echo -e "❌ 失败:   ${RED}$FAILED${NC}"
echo -e "⚠️ 需确认: ${YELLOW}$SKIPPED${NC}"
echo -e "📊 总计:   ${#P2_TESTS[@]}"
echo ""
echo -e "📄 详细报告: ${YELLOW}$REPORT_FILE${NC}"
echo ""

# 清理临时日志
rm -f /tmp/test-*.sh.log

# 退出码：如果有失败则返回1
if [ $FAILED -gt 0 ]; then
    exit 1
else
    exit 0
fi
