#!/bin/bash

# 系统状态快速检查脚本

echo "=========================================="
echo "🔍 系统状态快速检查"
echo "=========================================="
echo ""

DB_CMD="docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain --default-character-set=utf8mb4 -e"

# 1. 订单统计
echo "📦 1. 订单统计"
$DB_CMD "SELECT
  COUNT(*) as 订单总数,
  SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as 已完成,
  SUM(CASE WHEN status='in_progress' THEN 1 ELSE 0 END) as 进行中,
  SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) as 待开始
FROM t_production_order;" 2>&1 | grep -v Warning
echo ""

# 2. 扫码记录
echo "📱 2. 扫码记录统计"
$DB_CMD "SELECT
  COUNT(*) as 总扫码次数,
  COUNT(DISTINCT order_no) as 涉及订单数,
  COUNT(DISTINCT operator_id) as 操作员工数,
  DATE(MAX(scan_time)) as 最后扫码日期
FROM t_scan_record;" 2>&1 | grep -v Warning
echo ""

# 3. 质检入库
echo "✅ 3. 质检入库统计"
$DB_CMD "SELECT
  COUNT(*) as 入库批次,
  COALESCE(SUM(warehousing_quantity), 0) as 总入库数量,
  COALESCE(SUM(CASE WHEN quality_status='qualified' THEN warehousing_quantity ELSE 0 END), 0) as 合格数量
FROM t_product_warehousing;" 2>&1 | grep -v Warning
echo ""

# 4. 菲号统计
echo "🎫 4. 裁剪菲号统计"
$DB_CMD "SELECT
  COUNT(*) as 菲号总数,
  COUNT(DISTINCT production_order_no) as 关联订单数,
  COUNT(DISTINCT color) as 颜色数
FROM t_cutting_bundle;" 2>&1 | grep -v Warning
echo ""

# 5. 最近的问题记录
echo "⚠️  5. 最近的异常记录（错误日志）"
if [ -f "backend/logs/spring.log" ]; then
  ERROR_COUNT=$(grep -i "error\|exception" backend/logs/spring.log 2>/dev/null | wc -l)
  echo "后端错误日志数量: $ERROR_COUNT"
  if [ $ERROR_COUNT -gt 0 ]; then
    echo "最近3条错误:"
    grep -i "error\|exception" backend/logs/spring.log 2>/dev/null | tail -3
  fi
else
  echo "后端日志文件不存在"
fi
echo ""

# 6. 数据一致性检查
echo "🔄 6. 数据一致性检查"
$DB_CMD "SELECT
  o.order_no,
  o.order_quantity as 订单数量,
  COALESCE(SUM(s.quantity), 0) as 扫码数量,
  (COALESCE(SUM(s.quantity), 0) - o.order_quantity) as 差异
FROM t_production_order o
LEFT JOIN t_scan_record s ON o.order_no = s.order_no AND s.request_id NOT LIKE 'system-%'
GROUP BY o.order_no, o.order_quantity
HAVING ABS(COALESCE(SUM(s.quantity), 0) - o.order_quantity) > 10
LIMIT 5;" 2>&1 | grep -v Warning

INCONSISTENT=$($DB_CMD "SELECT COUNT(*) FROM (
  SELECT o.order_no
  FROM t_production_order o
  LEFT JOIN t_scan_record s ON o.order_no = s.order_no AND s.request_id NOT LIKE 'system-%'
  GROUP BY o.order_no, o.order_quantity
  HAVING ABS(COALESCE(SUM(s.quantity), 0) - o.order_quantity) > 10
) t;" 2>&1 | grep -v Warning | tail -1)

if [ "$INCONSISTENT" = "0" ]; then
  echo "✅ 数据一致性正常"
else
  echo "⚠️  发现 $INCONSISTENT 个订单数据不一致"
fi
echo ""

# 7. 系统健康状态
echo "🏥 7. 系统服务状态"
if curl -s http://localhost:8088/api/health > /dev/null 2>&1; then
  echo "✅ 后端服务: 运行正常 (http://localhost:8088)"
else
  echo "❌ 后端服务: 未运行"
fi

if lsof -i :5173 > /dev/null 2>&1; then
  echo "✅ 前端服务: 运行正常 (http://localhost:5173)"
else
  echo "❌ 前端服务: 未运行"
fi

if docker ps | grep fashion-mysql-simple > /dev/null 2>&1; then
  echo "✅ 数据库: 运行正常"
else
  echo "❌ 数据库: 未运行"
fi
echo ""

echo "=========================================="
echo "🎯 建议"
echo "=========================================="
echo ""
echo "如果发现以下情况，建议先修复再上线："
echo "  ❌ 数据不一致数量 > 0"
echo "  ❌ 后端错误日志 > 10条/天"
echo "  ❌ 任何服务未运行"
echo ""

echo "🔐 8. 权限漂移检查（可选）"
if [ "${CHECK_PERMISSION_GUARD:-0}" = "1" ]; then
  if python3 scripts/day2_permission_sample.py --mode guard > /tmp/day2_permission_guard.log 2>&1; then
    echo "✅ 权限 guard: 通过（7/7）"
  else
    echo "⚠️  权限 guard: 未通过（不阻断当前脚本）"
    echo "最近输出："
    tail -20 /tmp/day2_permission_guard.log
  fi
else
  echo "⏭️  已跳过（设置 CHECK_PERMISSION_GUARD=1 可启用）"
fi

if [ "${CHECK_PERMISSION_EXTENDED:-0}" = "1" ]; then
  if python3 scripts/day2_permission_sample.py --mode extended > /tmp/day2_permission_extended.log 2>&1; then
    echo "✅ 权限 extended: 通过（20/20）"
  else
    echo "⚠️  权限 extended: 未通过（不阻断当前脚本）"
    echo "最近输出："
    tail -20 /tmp/day2_permission_extended.log
  fi
else
  echo "⏭️  已跳过 extended（设置 CHECK_PERMISSION_EXTENDED=1 可启用）"
fi
echo ""

echo "可以上线的条件："
echo "  ✅ 所有服务运行正常"
echo "  ✅ 数据一致性良好"
echo "  ✅ 无严重错误日志"
echo "  ✅ 核心功能测试通过"
echo ""
