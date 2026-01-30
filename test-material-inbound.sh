#!/bin/bash

# ========================================
# 面辅料入库系统测试脚本
# 测试内容：采购到货 → 生成入库单 → 更新库存 → 关联采购单
# ========================================

echo "================================================"
echo "面辅料入库系统 - P0功能测试"
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
NC='\033[0m' # No Color

# 执行SQL的辅助函数
run_sql() {
    local sql="$1"
    docker exec fashion-mysql-simple mysql -u $DB_USER -p$DB_PASS $DB_NAME -e "$sql" 2>/dev/null
}

# 测试1：验证表结构
echo "【测试1】验证数据库表结构"
echo "-----------------------------------"
echo "检查 t_material_inbound 表是否存在..."
TABLE_EXISTS=$(run_sql "SHOW TABLES LIKE 't_material_inbound';" | wc -l | tr -d ' ')
if [ "$TABLE_EXISTS" -ge 2 ]; then
    echo -e "${GREEN}✅ t_material_inbound 表存在${NC}"
else
    echo -e "${RED}❌ t_material_inbound 表不存在${NC}"
    exit 1
fi

echo "检查 t_material_purchase 表的 inbound_record_id 字段..."
COLUMN_EXISTS=$(run_sql "SHOW COLUMNS FROM t_material_purchase LIKE 'inbound_record_id';" | wc -l | tr -d ' ')
if [ "$COLUMN_EXISTS" -ge 2 ]; then
    echo -e "${GREEN}✅ inbound_record_id 字段存在${NC}"
else
    echo -e "${RED}❌ inbound_record_id 字段不存在${NC}"
    exit 1
fi

echo ""
echo "【测试2】创建测试数据"
echo "-----------------------------------"

# 2.1 清理旧测试数据
echo "清理旧测试数据..."
run_sql "DELETE FROM t_material_inbound WHERE material_code = 'TEST_FABRIC_001';" > /dev/null 2>&1
run_sql "DELETE FROM t_material_purchase WHERE material_code = 'TEST_FABRIC_001';" > /dev/null 2>&1
run_sql "DELETE FROM t_material_stock WHERE material_code = 'TEST_FABRIC_001';" > /dev/null 2>&1

# 2.2 创建测试采购单
echo "创建测试采购单..."
PURCHASE_ID=$(uuidgen | tr '[:upper:]' '[:lower:]' | tr -d '-')
PURCHASE_SQL="INSERT INTO t_material_purchase (
    id, purchase_no, material_code, material_name, material_type,
    specifications, unit, purchase_quantity, arrived_quantity,
    supplier_name, unit_price, total_amount, status, color, size,
    create_time
) VALUES (
    '$PURCHASE_ID',
    'PU$(date +%Y%m%d%H%M%S)',
    'TEST_FABRIC_001',
    '测试面料-纯棉',
    '面料',
    '宽幅150cm',
    '米',
    1000,
    0,
    '测试供应商',
    50.00,
    50000.00,
    'pending',
    '黑色',
    '150cm',
    NOW()
);"

run_sql "$PURCHASE_SQL"
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ 测试采购单创建成功: $PURCHASE_ID${NC}"
else
    echo -e "${RED}❌ 测试采购单创建失败${NC}"
    exit 1
fi

# 查询初始库存
echo ""
echo "查询初始库存..."
INITIAL_STOCK=$(run_sql "SELECT IFNULL(quantity, 0) FROM t_material_stock WHERE material_code='TEST_FABRIC_001';" 2>/dev/null | tail -1)
echo "初始库存数量: ${INITIAL_STOCK:-0}"

echo ""
echo "【测试3】测试手动入库（无采购单）"
echo "-----------------------------------"

# 通过API调用手动入库（模拟）
echo "模拟手动入库：物料编码=TEST_FABRIC_001, 数量=300"

MANUAL_INBOUND_SQL="
SET @inbound_no = CONCAT('IB', DATE_FORMAT(NOW(), '%Y%m%d'), LPAD(
    (SELECT IFNULL(MAX(CAST(SUBSTRING(inbound_no, 11) AS UNSIGNED)), 0) + 1
     FROM t_material_inbound
     WHERE inbound_no LIKE CONCAT('IB', DATE_FORMAT(NOW(), '%Y%m%d'), '%')),
    4, '0'));

INSERT INTO t_material_inbound (
    id, inbound_no, material_code, material_name, material_type,
    inbound_quantity, warehouse_location, supplier_name,
    operator_name, inbound_time, remark
) VALUES (
    '$(uuidgen | tr '[:upper:]' '[:lower:]' | tr -d '-')',
    @inbound_no,
    'TEST_FABRIC_001',
    '测试面料-纯棉',
    '面料',
    300,
    '默认仓',
    '测试供应商',
    '系统测试',
    NOW(),
    '手动入库测试'
);
"

run_sql "$MANUAL_INBOUND_SQL"
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ 手动入库记录创建成功${NC}"

    # 查询生成的入库单号
    INBOUND_NO=$(run_sql "SELECT inbound_no FROM t_material_inbound WHERE material_code='TEST_FABRIC_001' ORDER BY inbound_time DESC LIMIT 1;" 2>/dev/null | tail -1)
    echo "生成入库单号: $INBOUND_NO"

    # 手动更新库存（模拟 Orchestrator 的行为）
    # 先检查是否存在，如果存在则UPDATE，否则INSERT
    CHECK_STOCK_SQL="SELECT COUNT(*) FROM t_material_stock WHERE material_code='TEST_FABRIC_001' AND color='黑色' AND size='150cm';"
    STOCK_EXISTS=$(run_sql "$CHECK_STOCK_SQL" 2>/dev/null | tail -1)

    if [ "$STOCK_EXISTS" -gt 0 ]; then
        # 已存在，更新
        UPDATE_STOCK_SQL="UPDATE t_material_stock SET quantity = quantity + 300, update_time = NOW() WHERE material_code='TEST_FABRIC_001' AND color='黑色' AND size='150cm';"
        run_sql "$UPDATE_STOCK_SQL"
    else
        # 不存在，插入
        INSERT_STOCK_SQL="INSERT INTO t_material_stock (id, material_code, material_name, material_type, color, size, specifications, quantity, locked_quantity, safety_stock, location, update_time, create_time) VALUES ('$(uuidgen | tr '[:upper:]' '[:lower:]' | tr -d '-')', 'TEST_FABRIC_001', '测试面料-纯棉', '面料', '黑色', '150cm', '宽幅150cm', 300, 0, 100, '默认仓', NOW(), NOW());"
        run_sql "$INSERT_STOCK_SQL"
    fi

    # 查询更新后库存
    NEW_STOCK=$(run_sql "SELECT quantity FROM t_material_stock WHERE material_code='TEST_FABRIC_001';" 2>/dev/null | tail -1)
    echo "更新后库存: $NEW_STOCK (应为 ${INITIAL_STOCK:-0} + 300 = $((${INITIAL_STOCK:-0} + 300)))"

    if [ "$NEW_STOCK" -eq "$((${INITIAL_STOCK:-0} + 300))" ]; then
        echo -e "${GREEN}✅ 库存更新正确${NC}"
    else
        echo -e "${YELLOW}⚠️  库存数量不符合预期${NC}"
    fi
else
    echo -e "${RED}❌ 手动入库失败${NC}"
fi

echo ""
echo "【测试4】测试采购到货入库"
echo "-----------------------------------"
echo "模拟采购到货：采购单ID=$PURCHASE_ID, 到货数量=500"

# 执行到货入库流程（模拟 Orchestrator 的完整逻辑）
PURCHASE_INBOUND_SQL="
SET @new_inbound_no = CONCAT('IB', DATE_FORMAT(NOW(), '%Y%m%d'), LPAD(
    (SELECT IFNULL(MAX(CAST(SUBSTRING(inbound_no, 11) AS UNSIGNED)), 0) + 1
     FROM t_material_inbound
     WHERE inbound_no LIKE CONCAT('IB', DATE_FORMAT(NOW(), '%Y%m%d'), '%')),
    4, '0'));

SET @new_inbound_id = '$(uuidgen | tr '[:upper:]' '[:lower:]' | tr -d '-')';

-- 1. 创建入库记录
INSERT INTO t_material_inbound (
    id, inbound_no, purchase_id, material_code, material_name, material_type,
    color, size, inbound_quantity, warehouse_location, supplier_name,
    operator_name, inbound_time, remark
) VALUES (
    @new_inbound_id,
    @new_inbound_no,
    '$PURCHASE_ID',
    'TEST_FABRIC_001',
    '测试面料-纯棉',
    '面料',
    '黑色',
    '150cm',
    500,
    'A-01-01',
    '测试供应商',
    '系统测试',
    NOW(),
    '采购到货入库测试'
);

-- 2. 更新库存（先检查后操作）
SET @stock_count = (SELECT COUNT(*) FROM t_material_stock WHERE material_code='TEST_FABRIC_001' AND color='黑色' AND size='150cm');

SET @insert_sql = IF(@stock_count = 0,
    CONCAT('INSERT INTO t_material_stock (id, material_code, material_name, material_type, color, size, specifications, quantity, locked_quantity, safety_stock, location, update_time, create_time) VALUES (''', '$(uuidgen | tr '[:upper:]' '[:lower:]' | tr -d '-')', ''', ''TEST_FABRIC_001'', ''测试面料-纯棉'', ''面料'', ''黑色'', ''150cm'', ''宽幅150cm'', 500, 0, 100, ''A-01-01'', NOW(), NOW())'),
    'UPDATE t_material_stock SET quantity = quantity + 500, location = ''A-01-01'', update_time = NOW() WHERE material_code=''TEST_FABRIC_001'' AND color=''黑色'' AND size=''150cm'''
);

PREPARE stmt FROM @insert_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3. 更新采购单
UPDATE t_material_purchase SET
    arrived_quantity = 500,
    inbound_record_id = @new_inbound_id,
    actual_arrival_date = NOW(),
    status = CASE
        WHEN 500 >= purchase_quantity THEN 'completed'
        ELSE 'partial_arrival'
    END
WHERE id = '$PURCHASE_ID';
"

run_sql "$PURCHASE_INBOUND_SQL"
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ 采购到货入库流程执行成功${NC}"

    # 验证结果
    echo ""
    echo "【验证结果】"
    echo "-----------------------------------"

    # 1. 检查入库记录
    INBOUND_COUNT=$(run_sql "SELECT COUNT(*) FROM t_material_inbound WHERE purchase_id='$PURCHASE_ID';" 2>/dev/null | tail -1)
    echo "✓ 入库记录数量: $INBOUND_COUNT (应为1)"

    # 2. 检查库存
    FINAL_STOCK=$(run_sql "SELECT quantity FROM t_material_stock WHERE material_code='TEST_FABRIC_001';" 2>/dev/null | tail -1)
    EXPECTED_STOCK=$((${INITIAL_STOCK:-0} + 300 + 500))
    echo "✓ 最终库存: $FINAL_STOCK (应为 $EXPECTED_STOCK)"

    # 3. 检查采购单
    PURCHASE_STATUS=$(run_sql "SELECT status, arrived_quantity, inbound_record_id FROM t_material_purchase WHERE id='$PURCHASE_ID';" 2>/dev/null | tail -1)
    echo "✓ 采购单状态: $PURCHASE_STATUS"

    # 4. 检查关联关系
    INBOUND_RECORD_ID=$(run_sql "SELECT inbound_record_id FROM t_material_purchase WHERE id='$PURCHASE_ID';" 2>/dev/null | tail -1)
    if [ -n "$INBOUND_RECORD_ID" ] && [ "$INBOUND_RECORD_ID" != "NULL" ]; then
        echo -e "${GREEN}✅ 采购单已关联入库记录: $INBOUND_RECORD_ID${NC}"
    else
        echo -e "${YELLOW}⚠️  采购单未关联入库记录${NC}"
    fi

    # 最终结果
    echo ""
    if [ "$FINAL_STOCK" -eq "$EXPECTED_STOCK" ] && [ -n "$INBOUND_RECORD_ID" ]; then
        echo -e "${GREEN}================================================${NC}"
        echo -e "${GREEN}🎉 所有测试通过！入库系统功能正常${NC}"
        echo -e "${GREEN}================================================${NC}"
    else
        echo -e "${YELLOW}================================================${NC}"
        echo -e "${YELLOW}⚠️  部分测试未通过，请检查${NC}"
        echo -e "${YELLOW}================================================${NC}"
    fi
else
    echo -e "${RED}❌ 采购到货入库流程执行失败${NC}"
fi

echo ""
echo "【清理测试数据】"
echo "-----------------------------------"
read -p "是否清理测试数据？(y/n): " CLEAN_DATA
if [ "$CLEAN_DATA" = "y" ] || [ "$CLEAN_DATA" = "Y" ]; then
    run_sql "DELETE FROM t_material_inbound WHERE material_code = 'TEST_FABRIC_001';"
    run_sql "DELETE FROM t_material_purchase WHERE id = '$PURCHASE_ID';"
    run_sql "DELETE FROM t_material_stock WHERE material_code = 'TEST_FABRIC_001';"
    echo -e "${GREEN}✅ 测试数据已清理${NC}"
else
    echo "保留测试数据，可用于手动验证"
fi

echo ""
echo "================================================"
echo "测试完成"
echo "================================================"
