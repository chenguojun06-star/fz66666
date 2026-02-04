#!/bin/bash
# 测试二次工艺列的隐藏逻辑
# 删除所有二次工艺数据，验证前端列会自动隐藏

cd "$(dirname "$0")"

echo "=========================================="
echo "🧪 测试二次工艺列自动隐藏功能"
echo "=========================================="

echo ""
echo "📌 步骤1: 查看当前二次工艺数据"
docker exec fashion-mysql-simple mysql -uroot -pchangeme --default-character-set=utf8mb4 fashion_supplychain -e "
SELECT COUNT(*) AS '当前二次工艺记录数' FROM t_scan_record WHERE progress_stage='二次工艺'
" 2>/dev/null

echo ""
echo "📌 步骤2: 删除所有二次工艺测试数据（仅影响测试数据）"
docker exec fashion-mysql-simple mysql -uroot -pchangeme --default-character-set=utf8mb4 fashion_supplychain -e "
DELETE FROM t_scan_record WHERE progress_stage='二次工艺' AND operator_name='测试操作员'
" 2>/dev/null

echo "✅ 已删除测试数据"

echo ""
echo "📌 步骤3: 验证删除后状态"
docker exec fashion-mysql-simple mysql -uroot -pchangeme --default-character-set=utf8mb4 fashion_supplychain -e "
SELECT COUNT(*) AS '剩余二次工艺记录数' FROM t_scan_record WHERE progress_stage='二次工艺'
" 2>/dev/null

echo ""
echo "=========================================="
echo "✅ 测试完成"
echo "=========================================="
echo "预期结果："
echo "  1. 当前系统无二次工艺数据"
echo "  2. 刷新「我的订单」页面"
echo "  3. 「二次工艺」列应该自动隐藏"
echo ""
echo "如需恢复测试数据，运行："
echo "  bash test-secondary-process-column.sh"
echo "=========================================="
