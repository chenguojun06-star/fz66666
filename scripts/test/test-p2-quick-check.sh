#!/bin/bash

# P2快速检查 - 只运行无需交互的核心测试
# 2026-02-15

set +e  # 继续运行即使有失败

echo "========================================"
echo "   P2核心测试快速验证"
echo "========================================"
echo ""

# 测试计数
PASSED=0
FAILED=0
SKIPPED=0

# 辅助函数
run_test() {
    local script="$1"
    local script_path="$script"
    local desc="$2"

    echo "[$(date +%H:%M:%S)] 测试: $desc"
    if [ ! -f "$script_path" ] && [ -f "scripts/test/$script" ]; then
        script_path="scripts/test/$script"
    fi

    echo "  脚本: $script_path"

    if [ ! -f "$script_path" ]; then
        echo "  ❌ 文件不存在"
        ((SKIPPED++))
        return
    fi

    # 运行测试（无超时限制，MacOS没有timeout命令）
    local log_name
    log_name=$(echo "$script" | tr '/' '_')
    if bash "$script_path" > "/tmp/${log_name}.log" 2>&1; then
        echo "  ✅ 通过"
        ((PASSED++))
    else
        EXIT_CODE=$?
        echo "  ❌ 失败 (退出码: $EXIT_CODE)"
        echo "     最后5行日志:"
        tail -5 "/tmp/${log_name}.log" 2>/dev/null | sed 's/^/     /'
        ((FAILED++))
    fi
    echo ""
}

# 核心P2测试列表（手动挑选可能自动运行的）
echo "测试1: 库存检查"
run_test "test-stock-check.sh" "库存系统完整性检查"

echo "测试2: BOM库存检查"
run_test "test-bom-stock-check.sh" "BOM物料库存关联"

echo "测试3: 仪表板数据"
run_test "test-dashboard-all.sh" "仪表板全量数据测试"

echo "测试4: 扫码反馈"
run_test "test-scan-feedback.sh" "扫码即时反馈功能"

echo "测试5: 延期订单功能"
run_test "test-overdue-order-feature.sh" "延期订单标记和筛选"

echo "测试6: 采购任务修复"
run_test "test-procurement-task-fix.sh" "采购任务状态修复"

echo "测试7: 样衣入库修复"
run_test "test-sample-inbound-fix.sh" "样衣入库流程修复"

echo "测试8: 订单数据完整性"
run_test "test-order-data-integrity.sh" "订单字段完整性检查"

echo "测试9: 租户数据完整性"
run_test "test-tenant-data-integrity.sh" "多租户数据完整性"

echo "测试10: 全量物料流程"
run_test "test-full-material-flow.sh" "完整物料采购→入库→使用流程"

# 统计总结
echo "========================================"
echo "   测试完成"
echo "========================================"
echo ""
echo "✅ 通过:   $PASSED"
echo "❌ 失败:   $FAILED"
echo "⏭️  跳过:   $SKIPPED"
echo "📊 总计:   $((PASSED +  FAILED + SKIPPED))"
echo ""

if [ $PASSED -gt 0 ]; then
    echo "✨ 至少有 $PASSED 个P2测试通过"
fi

if [ $FAILED -gt 0 ]; then
    echo "⚠️  有 $FAILED 个测试失败，详细日志在 /tmp/*.log"
fi
