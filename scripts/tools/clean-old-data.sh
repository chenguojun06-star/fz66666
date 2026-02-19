#!/bin/bash

# 清理系统中的旧数据和重复服务
# 创建时间：2026-01-26

set -e

echo "========================================="
echo "清理系统旧数据和重复服务"
echo "========================================="
echo ""

# 1. 停止所有旧的前端服务
echo "1️⃣  检查并停止旧的前端服务..."
OLD_VITE_PIDS=$(lsof -ti :5173 2>/dev/null || true)
if [ -n "$OLD_VITE_PIDS" ]; then
  echo "   发现端口5173上的服务，PID: $OLD_VITE_PIDS"
  kill $OLD_VITE_PIDS 2>/dev/null || true
  sleep 2
  echo "   ✅ 已停止5173端口服务"
else
  echo "   ✅ 没有发现5173端口服务"
fi

# 检查当前运行的Vite服务
CURRENT_VITE=$(lsof -i :5174 2>/dev/null | grep LISTEN || echo "无")
echo ""
echo "   当前前端服务状态："
echo "   $CURRENT_VITE"
echo ""

# 2. 清理前端构建缓存
echo "2️⃣  清理前端构建缓存..."
cd /Users/guojunmini4/Documents/服装66666/frontend
if [ -d "node_modules/.vite" ]; then
  rm -rf node_modules/.vite
  echo "   ✅ 已清理 Vite 缓存"
fi
if [ -d "dist" ]; then
  rm -rf dist
  echo "   ✅ 已清理 dist 构建目录"
fi

# 3. 清理浏览器localStorage（提示用户手动操作）
echo ""
echo "3️⃣  清理浏览器缓存（需要手动操作）："
echo "   请在浏览器中按 F12 打开开发者工具，执行："
echo "   localStorage.clear(); sessionStorage.clear();"
echo "   然后刷新页面（Cmd+Shift+R 强制刷新）"
echo ""

# 4. 检查数据库中的测试数据
echo "4️⃣  检查数据库中的测试数据..."
docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain \
  --default-character-set=utf8mb4 -e "
SELECT
  '测试订单' as 类型,
  COUNT(*) as 数量
FROM t_production_order
WHERE order_no LIKE 'TEST%'
UNION ALL
SELECT
  '2026年1月订单' as 类型,
  COUNT(*) as 数量
FROM t_production_order
WHERE order_no LIKE 'PO202601%'
UNION ALL
SELECT
  '孤立扫码记录' as 类型,
  COUNT(*) as 数量
FROM t_scan_record sr
LEFT JOIN t_production_order po ON sr.order_no = po.order_no
WHERE po.id IS NULL;
" 2>&1 | grep -v Warning

echo ""
echo "5️⃣  检查重复订单..."
DUPLICATE_ORDERS=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain \
  --default-character-set=utf8mb4 -e "
SELECT COUNT(*) FROM (
  SELECT order_no
  FROM t_production_order
  GROUP BY order_no
  HAVING COUNT(*) > 1
) as duplicates;
" 2>&1 | grep -v Warning | tail -1)

if [ "$DUPLICATE_ORDERS" = "0" ]; then
  echo "   ✅ 没有发现重复订单"
else
  echo "   ⚠️  发现 $DUPLICATE_ORDERS 个重复订单"
fi

echo ""
echo "========================================="
echo "清理完成！"
echo "========================================="
echo ""
echo "📋 后续操作建议："
echo "1. 重启前端服务：cd frontend && npm run dev"
echo "2. 清理浏览器缓存（见上方提示）"
echo "3. 使用 http://localhost:5174 访问系统"
echo "4. 如需清理测试数据，运行："
echo "   docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -e \"DELETE FROM t_production_order WHERE order_no LIKE 'TEST%'\""
echo ""
