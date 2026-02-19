#!/bin/bash

# ============================================
# 数据库索引执行脚本
# 执行日期: 2026-01-31
# ============================================

# 数据库连接信息
DB_HOST="127.0.0.1"
DB_PORT="3308"
DB_NAME="fashion_supplychain"
DB_USER="root"
DB_PASS="changeme"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=========================================="
echo "数据库索引优化脚本执行"
echo "=========================================="
echo ""

# 检查MySQL连接
echo -e "${YELLOW}检查数据库连接...${NC}"
mysql -h$DB_HOST -P$DB_PORT -u$DB_USER -p$DB_PASS -e "SELECT 1;" > /dev/null 2>&1

if [ $? -ne 0 ]; then
    echo -e "${RED}数据库连接失败，请检查配置${NC}"
    exit 1
fi

echo -e "${GREEN}数据库连接成功${NC}"
echo ""

# 执行索引脚本
echo -e "${YELLOW}开始执行索引优化脚本...${NC}"
echo ""

mysql -h$DB_HOST -P$DB_PORT -u$DB_USER -p$DB_PASS $DB_NAME << 'EOF'

-- ============================================
-- 数据库性能优化索引脚本
-- 执行日期: 2026-01-31
-- ============================================

-- 设置执行参数
SET SESSION innodb_lock_wait_timeout = 600;
SET SESSION lock_wait_timeout = 600;

-- 关闭唯一性检查以提高性能
SET SESSION unique_checks = 0;
SET SESSION foreign_key_checks = 0;

-- ============================================
-- 1. 生产订单表索引优化
-- ============================================

-- 订单编号索引（用于精确查询）
CREATE INDEX IF NOT EXISTS idx_production_order_no
ON t_production_order(order_no);

-- 款式编号索引（用于关联查询）
CREATE INDEX IF NOT EXISTS idx_production_style_no
ON t_production_order(style_no);

-- 工厂ID索引（用于工厂维度查询）
CREATE INDEX IF NOT EXISTS idx_production_factory_id
ON t_production_order(factory_id);

-- 状态索引（用于状态筛选）
CREATE INDEX IF NOT EXISTS idx_production_status
ON t_production_order(status);

-- 创建时间索引（用于排序和范围查询）
CREATE INDEX IF NOT EXISTS idx_production_create_time
ON t_production_order(create_time);

-- 复合索引：工厂+状态（常用查询组合）
CREATE INDEX IF NOT EXISTS idx_production_factory_status
ON t_production_order(factory_id, status);

-- 复合索引：款式+创建时间（用于款式历史查询）
CREATE INDEX IF NOT EXISTS idx_production_style_create
ON t_production_order(style_id, create_time);

-- 复合索引：状态+创建时间（用于状态筛选排序）
CREATE INDEX IF NOT EXISTS idx_production_status_create
ON t_production_order(status, create_time);

-- ============================================
-- 2. 入库表索引优化
-- ============================================

-- 订单ID索引（用于聚合查询）
CREATE INDEX IF NOT EXISTS idx_warehousing_order_id
ON t_product_warehousing(order_id);

-- 删除标记索引（用于软删除过滤）
CREATE INDEX IF NOT EXISTS idx_warehousing_delete_flag
ON t_product_warehousing(delete_flag);

-- 复合索引：订单+删除标记（覆盖常用查询）
CREATE INDEX IF NOT EXISTS idx_warehousing_order_delete
ON t_product_warehousing(order_id, delete_flag);

-- 复合索引：订单+删除标记+合格数量（覆盖聚合查询）
CREATE INDEX IF NOT EXISTS idx_warehousing_order_delete_qualified
ON t_product_warehousing(order_id, delete_flag, qualified_quantity);

-- ============================================
-- 3. 出库表索引优化
-- ============================================

-- 订单ID索引
CREATE INDEX IF NOT EXISTS idx_outstock_order_id
ON t_product_outstock(order_id);

-- 删除标记索引
CREATE INDEX IF NOT EXISTS idx_outstock_delete_flag
ON t_product_outstock(delete_flag);

-- 复合索引：订单+删除标记
CREATE INDEX IF NOT EXISTS idx_outstock_order_delete
ON t_product_outstock(order_id, delete_flag);

-- 复合索引：订单+删除标记+出库数量
CREATE INDEX IF NOT EXISTS idx_outstock_order_delete_quantity
ON t_product_outstock(order_id, delete_flag, outstock_quantity);

-- ============================================
-- 4. 裁剪菲号表索引优化
-- ============================================

-- 生产订单ID索引
CREATE INDEX IF NOT EXISTS idx_cutting_order_id
ON t_cutting_bundle(production_order_id);

-- 菲号索引（用于菲号查询）
CREATE INDEX IF NOT EXISTS idx_cutting_bundle_no
ON t_cutting_bundle(bundle_no);

-- 复合索引：订单+状态
CREATE INDEX IF NOT EXISTS idx_cutting_order_status
ON t_cutting_bundle(production_order_id, status);

-- ============================================
-- 5. 扫码记录表索引优化
-- ============================================

-- 订单ID索引
CREATE INDEX IF NOT EXISTS idx_scan_order_id
ON t_scan_record(order_id);

-- 菲号ID索引
CREATE INDEX IF NOT EXISTS idx_scan_bundle_id
ON t_scan_record(cutting_bundle_id);

-- 扫码时间索引（用于时间范围查询）
CREATE INDEX IF NOT EXISTS idx_scan_create_time
ON t_scan_record(create_time);

-- 复合索引：订单+扫码时间（覆盖常用查询）
CREATE INDEX IF NOT EXISTS idx_scan_order_time
ON t_scan_record(order_id, create_time);

-- ============================================
-- 6. 款式信息表索引优化
-- ============================================

-- 款号索引（用于精确查询）
CREATE INDEX IF NOT EXISTS idx_style_no
ON t_style_info(style_no);

-- 状态索引
CREATE INDEX IF NOT EXISTS idx_style_status
ON t_style_info(status);

-- 创建时间索引
CREATE INDEX IF NOT EXISTS idx_style_create_time
ON t_style_info(create_time);

-- ============================================
-- 7. 物料采购表索引优化
-- ============================================

-- 订单ID索引
CREATE INDEX IF NOT EXISTS idx_material_order_id
ON t_material_purchase(order_id);

-- 供应商ID索引
CREATE INDEX IF NOT EXISTS idx_material_supplier_id
ON t_material_purchase(supplier_id);

-- 状态索引
CREATE INDEX IF NOT EXISTS idx_material_status
ON t_material_purchase(status);

-- 复合索引：订单+状态
CREATE INDEX IF NOT EXISTS idx_material_order_status
ON t_material_purchase(order_id, status);

-- ============================================
-- 8. 工资结算表索引优化
-- ============================================

-- 订单ID索引
CREATE INDEX IF NOT EXISTS idx_payroll_order_id
ON t_payroll_settlement(order_id);

-- 工人ID索引
CREATE INDEX IF NOT EXISTS idx_payroll_worker_id
ON t_payroll_settlement(worker_id);

-- 结算日期索引
CREATE INDEX IF NOT EXISTS idx_payroll_date
ON t_payroll_settlement(settlement_date);

-- 复合索引：订单+工人
CREATE INDEX IF NOT EXISTS idx_payroll_order_worker
ON t_payroll_settlement(order_id, worker_id);

-- ============================================
-- 恢复设置
-- ============================================
SET SESSION unique_checks = 1;
SET SESSION foreign_key_checks = 1;

-- 显示创建的索引
SELECT 
    TABLE_NAME,
    INDEX_NAME,
    COLUMN_NAME,
    CARDINALITY
FROM 
    INFORMATION_SCHEMA.STATISTICS
WHERE 
    TABLE_SCHEMA = DATABASE()
    AND INDEX_NAME LIKE 'idx_%'
ORDER BY 
    TABLE_NAME, INDEX_NAME;

EOF

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}==========================================${NC}"
    echo -e "${GREEN}索引优化脚本执行成功！${NC}"
    echo -e "${GREEN}==========================================${NC}"
else
    echo ""
    echo -e "${RED}==========================================${NC}"
    echo -e "${RED}索引优化脚本执行失败！${NC}"
    echo -e "${RED}==========================================${NC}"
    exit 1
fi
