#!/bin/bash

# ========================================
# 面料库存表增加价格字段脚本
# ========================================

echo "================================================"
echo "为 t_material_stock 表添加价格相关字段"
echo "================================================"

DB_HOST="127.0.0.1"
DB_PORT="3308"
DB_NAME="fashion_supplychain"
DB_USER="root"
DB_PASS="changeme"

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

# 执行SQL
run_sql() {
    local sql="$1"
    docker exec fashion-mysql-simple mysql -u $DB_USER -p$DB_PASS $DB_NAME -e "$sql" 2>/dev/null
}

# 1. 添加 unit_price 字段
echo "1. 添加 unit_price (单价) 字段..."
run_sql "ALTER TABLE t_material_stock ADD COLUMN unit_price DECIMAL(10,2) DEFAULT 0.00 COMMENT '单价' AFTER location;" 2>/dev/null
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ unit_price 字段添加成功${NC}"
else
    echo -e "${RED}⚠️  unit_price 字段可能已存在或添加失败${NC}"
fi

# 2. 添加 total_value 字段
echo "2. 添加 total_value (库存总值) 字段..."
run_sql "ALTER TABLE t_material_stock ADD COLUMN total_value DECIMAL(12,2) DEFAULT 0.00 COMMENT '库存总值' AFTER unit_price;" 2>/dev/null
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ total_value 字段添加成功${NC}"
else
    echo -e "${RED}⚠️  total_value 字段可能已存在或添加失败${NC}"
fi

# 3. 添加 last_inbound_date 字段
echo "3. 添加 last_inbound_date (最后入库日期) 字段..."
run_sql "ALTER TABLE t_material_stock ADD COLUMN last_inbound_date DATETIME COMMENT '最后入库日期' AFTER total_value;" 2>/dev/null
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ last_inbound_date 字段添加成功${NC}"
else
    echo -e "${RED}⚠️  last_inbound_date 字段可能已存在或添加失败${NC}"
fi

# 4. 添加 last_outbound_date 字段
echo "4. 添加 last_outbound_date (最后出库日期) 字段..."
run_sql "ALTER TABLE t_material_stock ADD COLUMN last_outbound_date DATETIME COMMENT '最后出库日期' AFTER last_inbound_date;" 2>/dev/null
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ last_outbound_date 字段添加成功${NC}"
else
    echo -e "${RED}⚠️  last_outbound_date 字段可能已存在或添加失败${NC}"
fi

echo ""
echo "【验证结果】"
echo "-----------------------------------"
run_sql "SHOW COLUMNS FROM t_material_stock WHERE Field IN ('unit_price', 'total_value', 'last_inbound_date', 'last_outbound_date');"

echo ""
echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}✅ 字段添加完成！${NC}"
echo -e "${GREEN}================================================${NC}"
