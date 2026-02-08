#!/bin/bash

# ========================================
# 创建面料库存完整测试数据（含供应商和金额）
# ========================================

echo "================================================"
echo "创建面料库存测试数据（含供应商+单价+金额）"
echo "================================================"

DB_HOST="127.0.0.1"
DB_PORT="3308"
DB_NAME="fashion_supplychain"
DB_USER="root"
DB_PASS="changeme"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

run_sql() {
    local sql="$1"
    docker exec fashion-mysql-simple mysql -u $DB_USER -p$DB_PASS $DB_NAME -e "$sql" 2>/dev/null
}

echo "1. 清理旧测试数据..."
run_sql "DELETE FROM t_material_stock WHERE material_code LIKE 'TEST-%';"
echo -e "${GREEN}✅ 旧数据已清理${NC}"

echo ""
echo "2. 插入测试数据（3条面料 + 2条辅料）"
echo "-----------------------------------"

# 测试数据1：纯棉面料 - 测试供应商A
echo "创建测试数据 1/5: 纯棉面料（黑色）..."
run_sql "INSERT INTO t_material_stock (
    id, material_code, material_name, material_type, color, size,
    specifications, supplier_name, unit, quantity, locked_quantity,
    location, safety_stock, unit_price, total_value,
    fabric_width, fabric_weight, fabric_composition,
    last_inbound_date, create_time, update_time
) VALUES (
    UUID(),
    'TEST-FAB-001',
    '高档纯棉面料',
    '面料',
    '黑色',
    '150cm',
    '门幅150cm 200g/m²',
    '广州纺织供应商A',
    '米',
    1500,
    200,
    'A区-01-01',
    500,
    45.50,
    1500 * 45.50,
    '150cm',
    '200g/m²',
    '100%纯棉',
    NOW(),
    NOW(),
    NOW()
);"

# 测试数据2：涤纶面料 - 测试供应商B
echo "创建测试数据 2/5: 涤纶面料（白色）..."
run_sql "INSERT INTO t_material_stock (
    id, material_code, material_name, material_type, color, size,
    specifications, supplier_name, unit, quantity, locked_quantity,
    location, safety_stock, unit_price, total_value,
    fabric_width, fabric_weight, fabric_composition,
    last_inbound_date, last_outbound_date, create_time, update_time
) VALUES (
    UUID(),
    'TEST-FAB-002',
    '高弹涤纶面料',
    '面料',
    '白色',
    '160cm',
    '门幅160cm 180g/m²',
    '深圳面料有限公司',
    '米',
    2000,
    0,
    'A区-01-02',
    600,
    38.00,
    2000 * 38.00,
    '160cm',
    '180g/m²',
    '95%涤纶+5%氨纶',
    NOW() - INTERVAL 2 DAY,
    NOW() - INTERVAL 1 DAY,
    NOW(),
    NOW()
);"

# 测试数据3：混纺面料 - 测试供应商C
echo "创建测试数据 3/5: 混纺面料（灰色）..."
run_sql "INSERT INTO t_material_stock (
    id, material_code, material_name, material_type, color, size,
    specifications, supplier_name, unit, quantity, locked_quantity,
    location, safety_stock, unit_price, total_value,
    fabric_width, fabric_weight, fabric_composition,
    last_inbound_date, create_time, update_time
) VALUES (
    UUID(),
    'TEST-FAB-003',
    '精梳棉混纺面料',
    '面料',
    '灰色',
    '155cm',
    '门幅155cm 220g/m²',
    '杭州纺织集团',
    '米',
    800,
    100,
    'A区-02-01',
    400,
    52.80,
    800 * 52.80,
    '155cm',
    '220g/m²',
    '70%棉+30%涤纶',
    NOW() - INTERVAL 5 DAY,
    NOW(),
    NOW()
);"

# 测试数据4：拉链辅料 - 测试供应商D
echo "创建测试数据 4/5: YKK拉链（辅料）..."
run_sql "INSERT INTO t_material_stock (
    id, material_code, material_name, material_type, color, size,
    specifications, supplier_name, unit, quantity, locked_quantity,
    location, safety_stock, unit_price, total_value,
    last_inbound_date, create_time, update_time
) VALUES (
    UUID(),
    'TEST-ACC-001',
    'YKK树脂拉链',
    '辅料',
    '黑色',
    '60cm',
    '5号树脂闭尾拉链',
    '东莞拉链批发部',
    '条',
    5000,
    500,
    'B区-01-01',
    1000,
    3.50,
    5000 * 3.50,
    NOW() - INTERVAL 3 DAY,
    NOW(),
    NOW()
);"

# 测试数据5：纽扣辅料 - 测试供应商E
echo "创建测试数据 5/5: 树脂纽扣（辅料）..."
run_sql "INSERT INTO t_material_stock (
    id, material_code, material_name, material_type, color, size,
    specifications, supplier_name, unit, quantity, locked_quantity,
    location, safety_stock, unit_price, total_value,
    last_inbound_date, create_time, update_time
) VALUES (
    UUID(),
    'TEST-ACC-002',
    '四孔树脂纽扣',
    '辅料',
    '白色',
    '18mm',
    '直径18mm 四孔',
    '义乌辅料市场',
    '颗',
    10000,
    0,
    'B区-01-02',
    2000,
    0.15,
    10000 * 0.15,
    NOW() - INTERVAL 1 DAY,
    NOW(),
    NOW()
);"

echo ""
echo "【验证结果】"
echo "-----------------------------------"
run_sql "SELECT
    material_code AS '物料编码',
    material_name AS '物料名称',
    material_type AS '类型',
    supplier_name AS '供应商',
    CONCAT(quantity, unit) AS '库存',
    CONCAT('¥', FORMAT(unit_price, 2)) AS '单价',
    CONCAT('¥', FORMAT(total_value, 2)) AS '库存总值'
FROM t_material_stock
WHERE material_code LIKE 'TEST-%'
ORDER BY material_type, material_code;"

echo ""
echo "【统计汇总】"
echo "-----------------------------------"
run_sql "SELECT
    material_type AS '物料类型',
    COUNT(*) AS '条目数',
    SUM(quantity) AS '总数量',
    CONCAT('¥', FORMAT(SUM(total_value), 2)) AS '总库存价值'
FROM t_material_stock
WHERE material_code LIKE 'TEST-%'
GROUP BY material_type
WITH ROLLUP;"

echo ""
echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}✅ 测试数据创建完成！${NC}"
echo -e "${GREEN}   - 3条面料（含供应商+单价+金额）${NC}"
echo -e "${GREEN}   - 2条辅料（含供应商+单价+金额）${NC}"
echo -e "${GREEN}   - 库存总值约 ¥137,000 元${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""
echo "📋 前端访问地址："
echo "   http://localhost:5173/ (PC端)"
echo ""
echo "🧹 清理命令："
echo "   docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -e \"DELETE FROM t_material_stock WHERE material_code LIKE 'TEST-%';\""
