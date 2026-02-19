#!/bin/bash

# P2测试批量验证 - 2026-02-15
# 自动运行所有P2测试并生成报告

echo "======================================"
echo " P2测试批量验证"
echo "======================================"
echo ""

TOTAL=0
PASS=0
FAIL=0
SKIP=0

# P2测试列表
P2_TESTS=(
  "test-order-data-integrity.sh"
  "test-tenant-data-integrity.sh"
  "test-stock-check.sh"
  "test-material-inbound.sh"
  "test-sample-inbound-fix.sh"
  "test-procurement-task-fix.sh"
  "test-bom-stock-check.sh"
  "test-data-flow-to-reconciliation.sh"
  "test-search-functionality.sh"
  "test-scan-feedback.sh"
  "test-error-message-optimization.sh"
)

for test in "${P2_TESTS[@]}"; do
  ((TOTAL++))
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "[$TOTAL/${#P2_TESTS[@]}] 测试: $test"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  
  if [ ! -f "$test" ]; then
    echo "⏭️  跳过：文件不存在"
    ((SKIP++))
    echo ""
    continue
  fi
  
  # 运行测试
  bash "$test" > "/tmp/${test}.log" 2>&1
  EXIT_CODE=$?
  
  if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ 通过"
    ((PASS++))
  elif [ $EXIT_CODE -eq 124 ]; then
    echo "⏱️  超时（30秒）"
    ((FAIL++))
  else
    echo "❌ 失败（退出码: $EXIT_CODE）"
    echo ""
    echo "最后30行输出："
    tail -30 "/tmp/${test}.log"
    ((FAIL++))
  fi
  echo ""
done

echo "======================================"
echo " 测试总结"
echo "======================================"
echo "总计: $TOTAL"
echo "✅ 通过: $PASS"
echo "❌ 失败: $FAIL"
echo "⏭️  跳过: $SKIP"
echo ""

if [ $FAIL -gt 0 ]; then
  echo "⚠️  发现失败测试，请检查日志: /tmp/test-*.log"
  exit 1
else
  echo "🎉 所有P2测试通过！"
  exit 0
fi
