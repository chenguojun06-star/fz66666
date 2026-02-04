#!/bin/bash
# 测试二次工艺列的动态显示逻辑
# 场景1：有二次工艺数据时显示列
# 场景2：没有二次工艺数据时隐藏列

cd "$(dirname "$0")"

echo "=========================================="
echo "🧪 测试二次工艺列动态显示功能"
echo "=========================================="

# 检查数据库中是否有二次工艺数据
echo ""
echo "📊 1. 检查当前二次工艺数据状态..."
HAS_SECONDARY=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme --default-character-set=utf8mb4 fashion_supplychain -N -e "
SELECT COUNT(*) FROM t_scan_record WHERE progress_stage='二次工艺'
" 2>/dev/null)

echo "当前系统中二次工艺扫码记录数: $HAS_SECONDARY"

if [ "$HAS_SECONDARY" -gt 0 ]; then
  echo "✅ 系统有二次工艺数据 → 前端应该显示「二次工艺」列"
else
  echo "❌ 系统无二次工艺数据 → 前端应该隐藏「二次工艺」列"
fi

# 测试订单PO20260204001
echo ""
echo "📋 2. 检查测试订单 PO20260204001..."
docker exec fashion-mysql-simple mysql -uroot -pchangeme --default-character-set=utf8mb4 fashion_supplychain -e "
SELECT
  po.order_no AS '订单号',
  COUNT(CASE WHEN sr.progress_stage='二次工艺' THEN 1 END) AS '二次工艺记录数',
  v.secondary_process_start_time AS '开始时间',
  v.secondary_process_operator_name AS '操作员'
FROM t_production_order po
LEFT JOIN t_scan_record sr ON po.id=sr.order_id
LEFT JOIN v_production_order_flow_stage_snapshot v ON po.id=v.order_id
WHERE po.order_no='PO20260204001'
GROUP BY po.order_no, v.secondary_process_start_time, v.secondary_process_operator_name
" 2>/dev/null

echo ""
echo "=========================================="
echo "🔍 测试说明"
echo "=========================================="
echo "前端逻辑："
echo "  - 有任何订单配置了二次工艺 → 显示列"
echo "  - 所有订单都没有二次工艺 → 隐藏列"
echo ""
echo "判断依据："
echo "  1. progressNodeUnitPrices 中包含'二次工艺'关键词"
echo "  2. 或者 secondaryProcessStartTime/EndTime 有值"
echo ""
echo "📌 请打开浏览器刷新「我的订单」页面验证："
echo "  - 有数据：能看到「二次工艺」列，且 PO20260204001 显示进度"
echo "  - 无数据：「二次工艺」列不显示"
echo "=========================================="
