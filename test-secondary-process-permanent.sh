#!/bin/bash
# 测试二次工艺列的新显示逻辑

cd "$(dirname "$0")"

echo "=========================================="
echo "🎨 二次工艺列 - 常驻显示 + 灰色占位模式"
echo "=========================================="

echo ""
echo "📋 功能说明："
echo "  ✅ 二次工艺列【永远显示】（不再隐藏）"
echo "  ✅ 有数据：显示彩色进度条 + 可点击查看详情"
echo "  ✅ 无数据：显示灰色占位 + 点击无响应"
echo ""

# 检查当前数据状态
echo "=========================================="
echo "📊 当前数据状态检查"
echo "=========================================="

echo ""
echo "1️⃣ PO20260204001 订单（测试订单）"
docker exec fashion-mysql-simple mysql -uroot -pchangeme --default-character-set=utf8mb4 fashion_supplychain -e "
SELECT
  po.order_no AS '订单号',
  COUNT(CASE WHEN sr.progress_stage='二次工艺' THEN 1 END) AS '二次工艺记录',
  v.secondary_process_start_time AS '开始时间',
  v.secondary_process_operator_name AS '操作员',
  CASE
    WHEN v.secondary_process_start_time IS NOT NULL THEN '✅ 彩色进度条（可点击）'
    ELSE '⚪ 灰色占位（不可点击）'
  END AS '前端显示'
FROM t_production_order po
LEFT JOIN t_scan_record sr ON po.id=sr.order_id
LEFT JOIN v_production_order_flow_stage_snapshot v ON po.id=v.order_id
WHERE po.order_no='PO20260204001'
GROUP BY po.order_no, v.secondary_process_start_time, v.secondary_process_operator_name
" 2>/dev/null

echo ""
echo "2️⃣ 其他订单（随机抽样5个）"
docker exec fashion-mysql-simple mysql -uroot -pchangeme --default-character-set=utf8mb4 fashion_supplychain -e "
SELECT
  po.order_no AS '订单号',
  IFNULL(v.secondary_process_start_time, '无') AS '二次工艺时间',
  CASE
    WHEN v.secondary_process_start_time IS NOT NULL THEN '✅ 彩色'
    ELSE '⚪ 灰色'
  END AS '显示状态'
FROM t_production_order po
LEFT JOIN v_production_order_flow_stage_snapshot v ON po.id=v.order_id
WHERE po.order_no != 'PO20260204001'
ORDER BY po.create_time DESC
LIMIT 5
" 2>/dev/null

echo ""
echo "=========================================="
echo "🎯 前端显示规则"
echo "=========================================="
echo ""
echo "检测逻辑（按优先级）："
echo "  1. secondaryProcessStartTime/EndTime 有值 → 彩色进度条"
echo "  2. progressNodeUnitPrices 包含'二次工艺' → 彩色进度条"
echo "  3. 都没有 → 灰色占位（#e8e8e8背景 + '-' 文字）"
echo ""
echo "用户交互："
echo "  • 彩色进度条：鼠标悬停变灰 → 点击打开工序详情弹窗"
echo "  • 灰色占位：无hover效果 → 点击无响应"
echo ""

echo "=========================================="
echo "✅ 测试步骤"
echo "=========================================="
echo ""
echo "1. 刷新浏览器页面（Cmd + Shift + R 强制刷新）"
echo "2. 打开「我的订单」页面"
echo "3. 查看「二次工艺」列："
echo "   - PO20260204001：应显示彩色进度条"
echo "   - 其他订单：大部分显示灰色占位"
echo "4. 点击测试："
echo "   - PO20260204001：可打开弹窗，显示工序详情"
echo "   - 灰色订单：点击无反应"
echo ""
echo "=========================================="
