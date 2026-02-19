-- ============================================
-- 数据库性能优化索引脚本
-- 创建日期: 2026-01-31
-- 执行环境: MySQL 8.0+
-- ============================================

-- 建议在业务低峰期执行此脚本
-- 执行前请备份数据库

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
-- 5. 款式表索引优化
-- ============================================

-- 款式编号唯一索引（如果不存在）
-- 注意：如果已存在唯一约束，此语句会报错，请根据实际情况调整
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_style_no
-- ON t_style_info(style_no);

-- 状态索引
CREATE INDEX IF NOT EXISTS idx_style_status
ON t_style_info(status);

-- 创建时间索引
CREATE INDEX IF NOT EXISTS idx_style_create_time
ON t_style_info(create_time);

-- 分类索引
CREATE INDEX IF NOT EXISTS idx_style_category
ON t_style_info(category);

-- 复合索引：状态+创建时间
CREATE INDEX IF NOT EXISTS idx_style_status_create
ON t_style_info(status, create_time);

-- ============================================
-- 6. 物料表索引优化
-- ============================================

-- 物料编号索引
CREATE INDEX IF NOT EXISTS idx_material_no
ON t_material_info(material_no);

-- 物料名称索引（用于模糊查询）
CREATE INDEX IF NOT EXISTS idx_material_name
ON t_material_info(material_name);

-- 分类索引
CREATE INDEX IF NOT EXISTS idx_material_category
ON t_material_info(category);

-- ============================================
-- 7. 物料采购表索引优化
-- ============================================

-- 生产订单ID索引
CREATE INDEX IF NOT EXISTS idx_material_purchase_order_id
ON t_material_purchase(production_order_id);

-- 物料ID索引
CREATE INDEX IF NOT EXISTS idx_material_purchase_material_id
ON t_material_purchase(material_id);

-- 状态索引
CREATE INDEX IF NOT EXISTS idx_material_purchase_status
ON t_material_purchase(status);

-- 复合索引：订单+物料
CREATE INDEX IF NOT EXISTS idx_material_purchase_order_material
ON t_material_purchase(production_order_id, material_id);

-- ============================================
-- 8. 工序表索引优化
-- ============================================

-- 款式ID索引
CREATE INDEX IF NOT EXISTS idx_process_style_id
ON t_process_info(style_id);

-- 工序编号索引
CREATE INDEX IF NOT EXISTS idx_process_no
ON t_process_info(process_no);

-- 复合索引：款式+工序顺序
CREATE INDEX IF NOT EXISTS idx_process_style_sequence
ON t_process_info(style_id, sequence);

-- ============================================
-- 9. 生产记录表索引优化
-- ============================================

-- 生产订单ID索引
CREATE INDEX IF NOT EXISTS idx_production_record_order_id
ON t_production_record(production_order_id);

-- 工序ID索引
CREATE INDEX IF NOT EXISTS idx_production_record_process_id
ON t_production_record(process_id);

-- 日期索引（用于日期范围查询）
CREATE INDEX IF NOT EXISTS idx_production_record_date
ON t_production_record(record_date);

-- 复合索引：订单+工序
CREATE INDEX IF NOT EXISTS idx_production_record_order_process
ON t_production_record(production_order_id, process_id);

-- 复合索引：订单+日期
CREATE INDEX IF NOT EXISTS idx_production_record_order_date
ON t_production_record(production_order_id, record_date);

-- ============================================
-- 索引创建完成
-- ============================================

-- 查看所有创建的索引
-- SELECT
--     TABLE_NAME,
--     INDEX_NAME,
--     COLUMN_NAME,
--     CARDINALITY
-- FROM
--     INFORMATION_SCHEMA.STATISTICS
-- WHERE
--     TABLE_SCHEMA = DATABASE()
--     AND INDEX_NAME LIKE 'idx_%'
-- ORDER BY
--     TABLE_NAME, INDEX_NAME;

-- 分析表（更新统计信息）
-- ANALYZE TABLE t_production_order;
-- ANALYZE TABLE t_product_warehousing;
-- ANALYZE TABLE t_product_outstock;
-- ANALYZE TABLE t_cutting_bundle;
-- ANALYZE TABLE t_style_info;
