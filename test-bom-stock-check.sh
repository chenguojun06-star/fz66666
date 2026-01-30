#!/bin/bash

# ========================================
# BOM库存检查功能测试脚本
# 测试内容：创建BOM → 自动检查库存 → 显示库存状态
# ========================================

echo "================================================"
echo "BOM库存检查功能 - P1测试"
echo "================================================"
echo ""

# 数据库连接配置
DB_HOST="127.0.0.1"
DB_PORT="3308"
DB_NAME="fashion_supplychain"
DB_USER="root"
DB_PASS="changeme"

# 颜色输出
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 执行SQL的辅助函数
run_sql() {
    local sql="$1"
    docker exec fashion-mysql-simple mysql -u $DB_USER -p$DB_PASS $DB_NAME -e "$sql" 2>/dev/null
}

# 测试1：验证表结构
echo "【测试1】验证数据库表结构"
echo "-----------------------------------"
echo "检查 t_style_bom 表的库存检查字段..."
FIELDS=$(run_sql "SHOW COLUMNS FROM t_style_bom WHERE Field IN ('stock_status', 'available_stock', 'required_purchase');" | wc -l | tr -d ' ')
if [ "$FIELDS" -ge 4 ]; then
    echo -e "${GREEN}✅ 库存检查字段存在（3个）${NC}"
else
    echo -e "${RED}❌ 库存检查字段不完整${NC}"
    exit 1
fi

echo ""
echo "【测试2】准备测试数据"
echo "-----------------------------------"

# 2.1 清理旧测试数据
echo "清理旧测试数据..."
run_sql "DELETE FROM t_style_bom WHERE material_code LIKE 'TEST_MAT_%';" > /dev/null 2>&1
run_sql "DELETE FROM t_material_stock WHERE material_code LIKE 'TEST_MAT_%';" > /dev/null 2>&1

# 2.2 创建测试库存（3种状态）
echo "创建测试库存..."

# 物料1：充足库存（1000件）
run_sql "INSERT INTO t_material_stock (id, material_code, material_name, material_type, color, size, quantity, locked_quantity, safety_stock, create_time) VALUES ('$(uuidgen | tr '[:upper:]' '[:lower:]' | tr -d '-')', 'TEST_MAT_001', '测试面料-充足', '面料', '黑色', '150cm', 1000, 0, 100, NOW());"

# 物料2：不足库存（300件）
run_sql "INSERT INTO t_material_stock (id, material_code, material_name, material_type, color, size, quantity, locked_quantity, safety_stock, create_time) VALUES ('$(uuidgen | tr '[:upper:]' '[:lower:]' | tr -d '-')', 'TEST_MAT_002', '测试辅料-不足', '辅料', '白色', '10mm', 300, 0, 100, NOW());"

# 物料3：无库存（0件）
# 不插入记录，模拟无库存

echo -e "${GREEN}✅ 测试库存创建完成${NC}"
echo "   - TEST_MAT_001: 1000件（充足）"
echo "   - TEST_MAT_002: 300件（不足）"
echo "   - TEST_MAT_003: 无库存"

echo ""
echo "【测试3】创建测试BOM（模拟Service逻辑）"
echo "-----------------------------------"

# 假设生产数量：100件
PRODUCTION_QTY=100
echo "生产数量: $PRODUCTION_QTY 件"

# 创建BOM记录（包含库存检查逻辑）
# BOM 1: 需求800件（单件用量8 × 100件），库存1000件 → 充足
BOM1_REQUIRED=$((8 * PRODUCTION_QTY))
BOM1_AVAILABLE=1000
if [ $BOM1_AVAILABLE -ge $BOM1_REQUIRED ]; then
    BOM1_STATUS="sufficient"
    BOM1_PURCHASE=0
else
    BOM1_STATUS="insufficient"
    BOM1_PURCHASE=$((BOM1_REQUIRED - BOM1_AVAILABLE))
fi

run_sql "INSERT INTO t_style_bom (id, style_id, material_code, material_name, material_type, color, size, unit, usage_amount, loss_rate, unit_price, stock_status, available_stock, required_purchase, create_time) VALUES ('$(uuidgen | tr '[:upper:]' '[:lower:]' | tr -d '-')', 1, 'TEST_MAT_001', '测试面料-充足', '面料', '黑色', '150cm', '米', 8.0, 0, 50.00, '$BOM1_STATUS', $BOM1_AVAILABLE, $BOM1_PURCHASE, NOW());"

echo -e "BOM1: 物料TEST_MAT_001, 需求${BOM1_REQUIRED}件, 可用${BOM1_AVAILABLE}件 → ${GREEN}${BOM1_STATUS}${NC}"

# BOM 2: 需求500件（单件用量5 × 100件），库存300件 → 不足
BOM2_REQUIRED=$((5 * PRODUCTION_QTY))
BOM2_AVAILABLE=300
if [ $BOM2_AVAILABLE -ge $BOM2_REQUIRED ]; then
    BOM2_STATUS="sufficient"
    BOM2_PURCHASE=0
else
    BOM2_STATUS="insufficient"
    BOM2_PURCHASE=$((BOM2_REQUIRED - BOM2_AVAILABLE))
fi

run_sql "INSERT INTO t_style_bom (id, style_id, material_code, material_name, material_type, color, size, unit, usage_amount, loss_rate, unit_price, stock_status, available_stock, required_purchase, create_time) VALUES ('$(uuidgen | tr '[:upper:]' '[:lower:]' | tr -d '-')', 1, 'TEST_MAT_002', '测试辅料-不足', '辅料', '白色', '10mm', '个', 5.0, 0, 2.00, '$BOM2_STATUS', $BOM2_AVAILABLE, $BOM2_PURCHASE, NOW());"

echo -e "BOM2: 物料TEST_MAT_002, 需求${BOM2_REQUIRED}件, 可用${BOM2_AVAILABLE}件 → ${YELLOW}${BOM2_STATUS}（需采购${BOM2_PURCHASE}件）${NC}"

# BOM 3: 需求200件（单件用量2 × 100件），无库存 → 无库存
BOM3_REQUIRED=$((2 * PRODUCTION_QTY))
BOM3_AVAILABLE=0
BOM3_STATUS="none"
BOM3_PURCHASE=$BOM3_REQUIRED

run_sql "INSERT INTO t_style_bom (id, style_id, material_code, material_name, material_type, color, size, unit, usage_amount, loss_rate, unit_price, stock_status, available_stock, required_purchase, create_time) VALUES ('$(uuidgen | tr '[:upper:]' '[:lower:]' | tr -d '-')', 1, 'TEST_MAT_003', '测试拉链-无库存', '辅料', '金色', '60cm', '条', 2.0, 0, 10.00, '$BOM3_STATUS', $BOM3_AVAILABLE, $BOM3_PURCHASE, NOW());"

echo -e "BOM3: 物料TEST_MAT_003, 需求${BOM3_REQUIRED}件, 可用${BOM3_AVAILABLE}件 → ${RED}${BOM3_STATUS}（需采购${BOM3_PURCHASE}件）${NC}"

echo ""
echo "【测试4】验证BOM库存状态"
echo "-----------------------------------"

# 查询BOM记录并验证
RESULT=$(run_sql "SELECT material_code, stock_status, available_stock, required_purchase FROM t_style_bom WHERE material_code LIKE 'TEST_MAT_%' ORDER BY material_code;" 2>/dev/null)

echo "$RESULT"

echo ""
echo "【验证结果】"
echo "-----------------------------------"

# 统计各状态数量
SUFFICIENT_COUNT=$(run_sql "SELECT COUNT(*) FROM t_style_bom WHERE material_code LIKE 'TEST_MAT_%' AND stock_status='sufficient';" 2>/dev/null | tail -1)
INSUFFICIENT_COUNT=$(run_sql "SELECT COUNT(*) FROM t_style_bom WHERE material_code LIKE 'TEST_MAT_%' AND stock_status='insufficient';" 2>/dev/null | tail -1)
NONE_COUNT=$(run_sql "SELECT COUNT(*) FROM t_style_bom WHERE material_code LIKE 'TEST_MAT_%' AND stock_status='none';" 2>/dev/null | tail -1)

echo "✓ 库存充足: $SUFFICIENT_COUNT 项（应为1）"
echo "✓ 库存不足: $INSUFFICIENT_COUNT 项（应为1）"
echo "✓ 无库存: $NONE_COUNT 项（应为1）"

# 验证需采购数量
TOTAL_PURCHASE=$(run_sql "SELECT SUM(required_purchase) FROM t_style_bom WHERE material_code LIKE 'TEST_MAT_%';" 2>/dev/null | tail -1)
EXPECTED_PURCHASE=$((BOM2_PURCHASE + BOM3_PURCHASE))
echo "✓ 总需采购数量: $TOTAL_PURCHASE 件（应为${EXPECTED_PURCHASE}件）"

echo ""
# 最终结果
if [ "$SUFFICIENT_COUNT" -eq 1 ] && [ "$INSUFFICIENT_COUNT" -eq 1 ] && [ "$NONE_COUNT" -eq 1 ] && [ "$TOTAL_PURCHASE" -eq "$EXPECTED_PURCHASE" ]; then
    echo -e "${GREEN}================================================${NC}"
    echo -e "${GREEN}🎉 所有测试通过！BOM库存检查功能正常${NC}"
    echo -e "${GREEN}================================================${NC}"
else
    echo -e "${YELLOW}================================================${NC}"
    echo -e "${YELLOW}⚠️  部分测试未通过，请检查${NC}"
    echo -e "${YELLOW}================================================${NC}"
fi

echo ""
echo "【清理测试数据】"
echo "-----------------------------------"
read -p "是否清理测试数据？(y/n): " CLEAN_DATA
if [ "$CLEAN_DATA" = "y" ] || [ "$CLEAN_DATA" = "Y" ]; then
    run_sql "DELETE FROM t_style_bom WHERE material_code LIKE 'TEST_MAT_%';"
    run_sql "DELETE FROM t_material_stock WHERE material_code LIKE 'TEST_MAT_%';"
    echo -e "${GREEN}✅ 测试数据已清理${NC}"
else
    echo "保留测试数据，可用于手动验证"
fi

echo ""
echo "================================================"
echo "测试完成"
echo "================================================"
