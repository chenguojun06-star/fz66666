#!/bin/bash

# 测试BOM库存检查功能

echo "=== 测试BOM库存检查 ==="

# 1. 检查MaterialStock表是否有数据
echo "1. 检查面料库存表..."
mysql -h127.0.0.1 -P3308 -uroot -pchangeme fashion_supplychain << 'SQL'
SELECT COUNT(*) as total_stock FROM t_material_stock;
SELECT material_code, color, size, quantity, locked_quantity
FROM t_material_stock
LIMIT 5;
SQL

# 2. 检查StyleBom表数据
echo ""
echo "2. 检查BOM配置表..."
mysql -h127.0.0.1 -P3308 -uroot -pchangeme fashion_supplychain << 'SQL'
SELECT style_id, material_code, color, size, usage_amount, stock_status
FROM t_style_bom
ORDER BY id DESC
LIMIT 5;
SQL

# 3. 调用库存检查API
echo ""
echo "3. 测试API调用（需要先获取有效的styleId）..."
# 获取第一个有BOM的styleId
STYLE_ID=$(mysql -h127.0.0.1 -P3308 -uroot -pchangeme fashion_supplychain -N -e "SELECT DISTINCT style_id FROM t_style_bom LIMIT 1")

if [ -n "$STYLE_ID" ]; then
    echo "测试 styleId=$STYLE_ID"
    curl -s -X POST "http://localhost:8088/style/bom/check-stock/${STYLE_ID}?productionQty=1" \
         -H "Content-Type: application/json" | jq '.'
else
    echo "没有找到有BOM配置的款式"
fi

echo ""
echo "=== 测试完成 ==="
