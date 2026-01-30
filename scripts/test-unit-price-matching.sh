#!/bin/bash

# 单价匹配测试脚本
# 验证三层匹配机制：名称匹配 → ID匹配 → 模糊匹配

echo "=================================================="
echo "单价匹配测试 - 三层保护机制验证"
echo "=================================================="
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试订单
ORDER_NO="PO20260130003"

echo "📋 测试订单: $ORDER_NO"
echo ""

# 1. 查看订单工序配置
echo "1️⃣  订单工序配置（progressWorkflowJson）"
echo "-------------------------------------------"
docker exec fashion-mysql-simple mysql -u root -pchangeme fashion_supplychain -e "
SELECT
    order_no,
    JSON_PRETTY(progress_workflow_json) AS workflow
FROM t_production_order
WHERE order_no = '$ORDER_NO';
" | cat

echo ""
echo "2️⃣  扫码记录（process_name 和 单价）"
echo "-------------------------------------------"
docker exec fashion-mysql-simple mysql -u root -pchangeme fashion_supplychain -e "
SELECT
    id,
    order_no,
    process_code AS '工序编号',
    process_name AS '工序名',
    HEX(process_name) AS '工序名HEX',
    quantity AS '数量',
    process_unit_price AS '工序单价',
    unit_price AS '单价',
    scan_cost AS '成本',
    total_amount AS '金额'
FROM t_scan_record
WHERE order_no = '$ORDER_NO'
ORDER BY scan_time DESC;
" | cat

echo ""
echo "3️⃣  验证单价匹配规则"
echo "-------------------------------------------"
echo "【三层匹配机制】"
echo "  优先级1: 通过工序名称精确匹配（正常情况）"
echo "  优先级2: 通过工序ID匹配（charset乱码时的fallback）"
echo "  优先级3: 模糊匹配常见工序（最后的兜底）"
echo ""

# 检查是否有单价为0的记录
ZERO_PRICE_COUNT=$(docker exec fashion-mysql-simple mysql -u root -pchangeme fashion_supplychain -sN -e "
SELECT COUNT(*)
FROM t_scan_record
WHERE order_no = '$ORDER_NO'
  AND (unit_price = 0 OR unit_price IS NULL);
")

echo "单价为0的记录数: $ZERO_PRICE_COUNT"
echo ""

if [ "$ZERO_PRICE_COUNT" -gt 0 ]; then
    echo -e "${RED}❌ 发现单价匹配失败！${NC}"
    echo ""
    echo "解决方案："
    echo "1. 确保后端服务已重启（应用新的三层匹配逻辑）"
    echo "2. 检查 SKUServiceImpl.java 的日志输出"
    echo "3. 重新扫码测试（会自动匹配单价）"
else
    echo -e "${GREEN}✅ 所有扫码记录单价匹配成功！${NC}"
fi

echo ""
echo "4️⃣  工序单价统计"
echo "-------------------------------------------"
docker exec fashion-mysql-simple mysql -u root -pchangeme fashion_supplychain -e "
SELECT
    process_name AS '工序',
    COUNT(*) AS '扫码次数',
    AVG(unit_price) AS '平均单价',
    SUM(total_amount) AS '总金额'
FROM t_scan_record
WHERE order_no = '$ORDER_NO'
GROUP BY process_name;
" | cat

echo ""
echo "=================================================="
echo "测试完成"
echo "=================================================="
echo ""
echo "💡 提示："
echo "- 裁剪工序单价应为 ¥18.00"
echo "- 采购工序不应有工资（单价为0）"
echo "- 如发现问题，查看 backend/logs/app.log 的 [SKUService] 日志"
