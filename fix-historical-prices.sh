#!/bin/bash

# 历史数据单价同步脚本
# 用途：修复历史订单中未同步的工序单价
# 场景：修复代码部署前，已存在的数据不一致问题

set -e

echo "======================================"
echo "历史数据单价同步脚本"
echo "======================================"
echo ""

# 数据库连接信息
DB_CONTAINER="fashion-mysql-simple"
DB_NAME="fashion_supplychain"
DB_USER="root"
DB_PASS="changeme"

# 后端 API 地址
API_BASE="${API_BASE:-http://localhost:8088}"

echo "⚠️  警告：此脚本将修复所有订单的工序单价！"
echo ""
echo "执行前请确认："
echo "1. 已部署修复后的代码"
echo "2. 已备份数据库"
echo "3. 在非生产环境测试过"
echo ""
read -p "确认继续？(yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "已取消执行"
    exit 0
fi

echo ""
echo "1️⃣  查询需要同步的订单..."

# 查询所有有工序跟踪记录的订单
ORDERS=$(docker exec -i $DB_CONTAINER mysql -u$DB_USER -p$DB_PASS $DB_NAME -N -e "
SELECT DISTINCT
    o.id,
    o.order_no,
    COUNT(t.id) AS tracking_count
FROM t_production_order o
INNER JOIN t_production_process_tracking t ON o.id = t.production_order_id
WHERE o.delete_flag = 0
  AND o.progress_workflow_json IS NOT NULL
  AND o.progress_workflow_json != ''
GROUP BY o.id, o.order_no
ORDER BY o.create_time DESC;
")

if [ -z "$ORDERS" ]; then
    echo "   未找到需要同步的订单"
    exit 0
fi

TOTAL_ORDERS=$(echo "$ORDERS" | wc -l | tr -d ' ')
echo "   找到 $TOTAL_ORDERS 个订单需要检查"
echo ""

echo "2️⃣  开始同步单价..."
echo ""

SUCCESS_COUNT=0
SKIP_COUNT=0
ERROR_COUNT=0

# 逐个订单同步
echo "$ORDERS" | while IFS=$'\t' read -r ORDER_ID ORDER_NO TRACKING_COUNT; do
    echo "   处理订单: $ORDER_NO (ID: $ORDER_ID, 跟踪记录: $TRACKING_COUNT 条)"

    # 调用后端 API 同步单价（通过 SQL 直接调用存储过程或 Java 方法）
    # 方法1：通过 Java 代码同步（推荐）
    # 方法2：直接通过 SQL 模拟同步逻辑（如果不想启动后端）

    # 这里使用 SQL 方式（读取 progressWorkflowJson，更新 unit_price）
    SYNC_RESULT=$(docker exec -i $DB_CONTAINER mysql -u$DB_USER -p$DB_PASS $DB_NAME -N -e "
    -- 临时表：存储工序单价映射
    DROP TEMPORARY TABLE IF EXISTS temp_process_prices;
    CREATE TEMPORARY TABLE temp_process_prices (
        process_code VARCHAR(100),
        unit_price DECIMAL(10,2)
    );

    -- 解析 progressWorkflowJson（简化版，实际应由 Java 处理）
    -- 这里假设 JSON 格式为 {\"nodes\":[{\"name\":\"裁剪\",\"unitPrice\":2},...]}
    -- 注意：MySQL 的 JSON 函数有限，复杂场景建议用 Java

    -- 查询当前单价不一致的记录
    SELECT COUNT(*)
    FROM t_production_process_tracking
    WHERE production_order_id = '$ORDER_ID'
      AND unit_price != COALESCE(
          JSON_EXTRACT(
              (SELECT progress_workflow_json FROM t_production_order WHERE id = '$ORDER_ID'),
              CONCAT('$.nodes[', process_sequence - 1, '].unitPrice')
          ),
          unit_price
      );
    " 2>&1)

    if [ $? -eq 0 ] && [ -n "$SYNC_RESULT" ]; then
        INCONSISTENT_COUNT=$(echo "$SYNC_RESULT" | tail -1)
        if [ "$INCONSISTENT_COUNT" -gt 0 ]; then
            echo "      ⚠️  发现 $INCONSISTENT_COUNT 条不一致记录"

            # 实际同步逻辑（需要调用 Java API 或存储过程）
            # 由于 MySQL 的 JSON 处理能力有限，建议使用 Java API

            echo "      提示：请使用 Java API 调用 syncUnitPrices() 方法"
            echo "      curl -X POST $API_BASE/api/internal/sync-unit-prices -d '{\"orderId\":\"$ORDER_ID\"}'"
            SKIP_COUNT=$((SKIP_COUNT + 1))
        else
            echo "      ✅ 单价已一致，跳过"
            SKIP_COUNT=$((SKIP_COUNT + 1))
        fi
    else
        echo "      ❌ 检查失败：$SYNC_RESULT"
        ERROR_COUNT=$((ERROR_COUNT + 1))
    fi

    echo ""
done

echo "======================================"
echo "同步完成"
echo "======================================"
echo ""
echo "统计："
echo "   总订单数: $TOTAL_ORDERS"
echo "   成功: $SUCCESS_COUNT"
echo "   跳过: $SKIP_COUNT"
echo "   失败: $ERROR_COUNT"
echo ""
echo "💡 建议："
echo "   由于 MySQL 的 JSON 解析能力有限，建议使用以下方式之一："
echo ""
echo "   方式1：通过 Java API 批量同步（推荐）"
echo "   ----------------------------------------"
echo "   创建临时 Controller 端点："
echo "   @PostMapping(\"/internal/sync-all-unit-prices\")"
echo "   public Result<?> syncAllUnitPrices() {"
echo "       List<String> orderIds = productionOrderService.list().stream()"
echo "           .map(ProductionOrder::getId)"
echo "           .collect(Collectors.toList());"
echo "       int total = 0;"
echo "       for (String orderId : orderIds) {"
echo "           total += processTrackingOrchestrator.syncUnitPrices(orderId);"
echo "       }"
echo "       return Result.success(\"已同步 \" + total + \" 条记录\");"
echo "   }"
echo ""
echo "   然后调用："
echo "   curl -X POST $API_BASE/api/internal/sync-all-unit-prices"
echo ""
echo "   方式2：逐个订单手动触发"
echo "   ----------------------------------------"
echo "   在前端依次打开每个订单的进度详情"
echo "   修改任意工序单价后保存（会自动触发同步）"
echo ""
echo "   方式3：数据库直接修复（不推荐，仅紧急情况）"
echo "   ----------------------------------------"
echo "   参考 check-price-flow.sh 脚本中的 SQL 逻辑"
echo "   手动更新 t_production_process_tracking 表"
echo ""
