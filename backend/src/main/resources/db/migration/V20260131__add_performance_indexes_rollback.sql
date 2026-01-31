-- ============================================
-- 数据库性能优化索引回滚脚本
-- 创建日期: 2026-01-31
-- 执行环境: MySQL 8.0+
-- ============================================

-- 此脚本用于回滚V20260131__add_performance_indexes.sql创建的索引
-- 请在需要回滚时执行

-- ============================================
-- 1. 生产订单表索引回滚
-- ============================================

DROP INDEX IF EXISTS idx_production_order_no ON t_production_order;
DROP INDEX IF EXISTS idx_production_style_no ON t_production_order;
DROP INDEX IF EXISTS idx_production_factory_id ON t_production_order;
DROP INDEX IF EXISTS idx_production_status ON t_production_order;
DROP INDEX IF EXISTS idx_production_create_time ON t_production_order;
DROP INDEX IF EXISTS idx_production_factory_status ON t_production_order;
DROP INDEX IF EXISTS idx_production_style_create ON t_production_order;
DROP INDEX IF EXISTS idx_production_status_create ON t_production_order;

-- ============================================
-- 2. 入库表索引回滚
-- ============================================

DROP INDEX IF EXISTS idx_warehousing_order_id ON t_product_warehousing;
DROP INDEX IF EXISTS idx_warehousing_delete_flag ON t_product_warehousing;
DROP INDEX IF EXISTS idx_warehousing_order_delete ON t_product_warehousing;
DROP INDEX IF EXISTS idx_warehousing_order_delete_qualified ON t_product_warehousing;

-- ============================================
-- 3. 出库表索引回滚
-- ============================================

DROP INDEX IF EXISTS idx_outstock_order_id ON t_product_outstock;
DROP INDEX IF EXISTS idx_outstock_delete_flag ON t_product_outstock;
DROP INDEX IF EXISTS idx_outstock_order_delete ON t_product_outstock;
DROP INDEX IF EXISTS idx_outstock_order_delete_quantity ON t_product_outstock;

-- ============================================
-- 4. 裁剪菲号表索引回滚
-- ============================================

DROP INDEX IF EXISTS idx_cutting_order_id ON t_cutting_bundle;
DROP INDEX IF EXISTS idx_cutting_bundle_no ON t_cutting_bundle;
DROP INDEX IF EXISTS idx_cutting_order_status ON t_cutting_bundle;

-- ============================================
-- 5. 款式表索引回滚
-- ============================================

DROP INDEX IF EXISTS idx_style_status ON t_style_info;
DROP INDEX IF EXISTS idx_style_create_time ON t_style_info;
DROP INDEX IF EXISTS idx_style_category ON t_style_info;
DROP INDEX IF EXISTS idx_style_status_create ON t_style_info;

-- ============================================
-- 6. 物料表索引回滚
-- ============================================

DROP INDEX IF EXISTS idx_material_no ON t_material_info;
DROP INDEX IF EXISTS idx_material_name ON t_material_info;
DROP INDEX IF EXISTS idx_material_category ON t_material_info;

-- ============================================
-- 7. 物料采购表索引回滚
-- ============================================

DROP INDEX IF EXISTS idx_material_purchase_order_id ON t_material_purchase;
DROP INDEX IF EXISTS idx_material_purchase_material_id ON t_material_purchase;
DROP INDEX IF EXISTS idx_material_purchase_status ON t_material_purchase;
DROP INDEX IF EXISTS idx_material_purchase_order_material ON t_material_purchase;

-- ============================================
-- 8. 工序表索引回滚
-- ============================================

DROP INDEX IF EXISTS idx_process_style_id ON t_process_info;
DROP INDEX IF EXISTS idx_process_no ON t_process_info;
DROP INDEX IF EXISTS idx_process_style_sequence ON t_process_info;

-- ============================================
-- 9. 生产记录表索引回滚
-- ============================================

DROP INDEX IF EXISTS idx_production_record_order_id ON t_production_record;
DROP INDEX IF EXISTS idx_production_record_process_id ON t_production_record;
DROP INDEX IF EXISTS idx_production_record_date ON t_production_record;
DROP INDEX IF EXISTS idx_production_record_order_process ON t_production_record;
DROP INDEX IF EXISTS idx_production_record_order_date ON t_production_record;

-- ============================================
-- 索引回滚完成
-- ============================================

-- 查看剩余的索引
-- SELECT 
--     TABLE_NAME,
--     INDEX_NAME,
--     COLUMN_NAME
-- FROM 
--     INFORMATION_SCHEMA.STATISTICS
-- WHERE 
--     TABLE_SCHEMA = DATABASE()
--     AND INDEX_NAME LIKE 'idx_%'
-- ORDER BY 
--     TABLE_NAME, INDEX_NAME;
