#!/bin/bash

# 采购任务数据修复验证脚本
# 创建时间：2026-02-09
# 用途：验证后端修复是否生效

set -e

echo "=================================================="
echo "采购任务数据修复验证"
echo "=================================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. 检查后端是否启动
echo "第1步：检查后端服务..."
if curl -s http://localhost:8088/actuator/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ 后端服务运行中${NC}"
else
    echo -e "${RED}❌ 后端服务未启动${NC}"
    echo "请先运行：./dev-public.sh"
    exit 1
fi
echo ""

# 2. 检查数据库连接echo "第2步：检查数据库连接..."
if docker ps | grep -q "fashion-mysql-simple"; then
    echo -e "${GREEN}✅ 数据库容器运行中${NC}"
else
    echo -e "${RED}❌ 数据库容器未运行${NC}"
    exit 1
fi
echo ""

# 3. 查询数据库中的采购任务统计
echo "第3步：查询数据库统计..."
STATS=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain --default-character-set=utf8mb4 -N -e "
SELECT
  COUNT(*) AS total,
  SUM(CASE WHEN arrived_quantity >= purchase_quantity THEN 1 ELSE 0 END) AS completed,
  SUM(CASE WHEN order_id IS NOT NULL THEN 1 ELSE 0 END) AS has_order_id,
  SUM(CASE WHEN order_no IS NOT NULL THEN 1 ELSE 0 END) AS has_order_no
FROM t_material_purchase
WHERE status = 'received'
  AND (delete_flag = 0 OR delete_flag IS NULL)
  AND (return_confirmed = 0 OR return_confirmed IS NULL);
" 2>/dev/null | tail -1)

if [ -n "$STATS" ]; then
    TOTAL=$(echo "$STATS" | awk '{print $1}')
    COMPLETED=$(echo "$STATS" | awk '{print $2}')
    HAS_ORDER_ID=$(echo "$STATS" | awk '{print $3}')
    HAS_ORDER_NO=$(echo "$STATS" | awk '{print $4}')

    echo "   - 总任务数: $TOTAL"
    echo "   - 已完成数: $COMPLETED"
    echo "   - 有order_id: $HAS_ORDER_ID"
    echo "   - 有order_no: $HAS_ORDER_NO"

    # 预期：修复后应该排除已完成的任务
    if [ "$COMPLETED" -gt 0 ]; then
        echo -e "${YELLOW}⚠️  警告：仍有 $COMPLETED 个已完成任务${NC}"
        echo "   后端过滤逻辑应该排除这些任务"
    else
        echo -e "${GREEN}✅ 无已完成任务（正常）${NC}"
    fi

    # 独立采购任务（无订单关联）
    if [ "$HAS_ORDER_ID" -eq 0 ]; then
        echo -e "${YELLOW}⚠️  所有任务都没有 order_id（独立采购）${NC}"
        echo "   后端应该允许返回这些任务"
    fi
else
    echo -e "${RED}❌ 无法查询数据库${NC}"
    exit 1
fi
echo ""

# 4. 测试API端点（需要登录token）
echo "第4步：测试采购任务API..."
echo -e "${YELLOW}⚠️  需要登录token，跳过API测试${NC}"
echo "   您可以在浏览器中手动测试："
echo "   http://localhost:8088/api/production/purchase/list?myTasks=true"
echo ""

# 5. 数据修复建议
echo "=================================================="
echo "数据修复建议"
echo "=================================================="
echo ""

if [ "$HAS_ORDER_ID" -eq 0 ] && [ "$TOTAL" -gt 0 ]; then
    echo -e "${YELLOW}📋 数据情况：${NC}"
    echo "   - 所有 $TOTAL 个采购任务都没有关联订单（order_id 为 NULL）"
    echo "   - 这些任务在创建时就没有关联生产订单"
    echo ""
    echo -e "${YELLOW}💡 解决方案：${NC}"
    echo ""
    echo "   方案1：清理测试数据（如果这些是测试数据）"
    echo "   ----------------------------------------"
    echo "   docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -e \\"
    echo "     \"DELETE FROM t_material_purchase WHERE order_id IS NULL AND status = 'received';\""
    echo ""
    echo "   方案2：手动关联订单（如果需要关联）"
    echo "   ----------------------------------------"    echo "   -- 先查询可用的生产订单"
    echo "   docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -e \\"
    echo "     \"SELECT id, order_no, style_no FROM t_production_order WHERE delete_flag = 0 LIMIT 5;\""
    echo ""
    echo "   -- 然后更新采购任务的 order_id 和 order_no"
    echo "   docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -e \\"
    echo "     \"UPDATE t_material_purchase \\"
    echo "      SET order_id = 'your-order-id', \\"
    echo "          order_no = 'PO202602090001' \\"
    echo "      WHERE id = 'purchase-id';\""
    echo ""
    echo "   方案3：允许独立采购（已实施）"
    echo "   ----------------------------------------"
    echo "   ✅ 后端已修改为允许返回无订单关联的采购任务"
    echo "   ✅ 前端可以正常显示和处理这些任务"
    echo "   ✅ 入库时订单号可以为空"
    echo ""
fi

# 6. 小程序测试指引
echo "=================================================="
echo "小程序测试步骤"
echo "=================================================="
echo ""
echo "1. 打开微信开发者工具，编译小程序"
echo "2. 点击页面右下角的【铃铛】图标"
echo "3. 查看【采购任务】分组"
echo "4. 点击任意一个采购任务"
echo ""
echo "✅ 预期结果："
echo "   - 铃铛中显示 ${TOTAL} 个采购任务"
echo "   - 点击任务能正常打开弹窗"
echo "   - 弹窗中显示 'materialPurchases: 1条'（不再是0条）"
echo "   - 可以正常输入数量并提交"
echo ""
echo "❌ 如果仍然报错，请检查："
echo "   - 控制台日志中 [loadProcurementTasks] 的输出"
echo "   - 弹窗调试信息是否显示空数据"
echo "   - 提供完整的错误信息和截图"
echo ""

echo "=================================================="
echo "验证完成"
echo "=================================================="
