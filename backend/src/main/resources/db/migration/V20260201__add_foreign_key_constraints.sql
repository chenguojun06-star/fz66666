-- ============================================
-- 数据库外键约束添加脚本
-- 创建日期: 2026-02-01
-- 执行环境: MySQL 8.0+
-- ============================================

-- 建议在业务低峰期执行此脚本
-- 执行前请备份数据库

-- ============================================
-- 1. 生产订单表外键约束
-- ============================================

-- 生产订单关联款式
ALTER TABLE t_production_order
ADD CONSTRAINT fk_production_order_style
FOREIGN KEY (style_id) REFERENCES t_style_info(id)
ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================
-- 2. 物料采购表外键约束
-- ============================================

-- 物料采购关联生产订单
ALTER TABLE t_material_purchase
ADD CONSTRAINT fk_material_purchase_order
FOREIGN KEY (order_id) REFERENCES t_production_order(id)
ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================
-- 3. 裁剪任务表外键约束
-- ============================================

-- 裁剪任务关联生产订单
ALTER TABLE t_cutting_task
ADD CONSTRAINT fk_cutting_task_order
FOREIGN KEY (order_id) REFERENCES t_production_order(id)
ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================
-- 4. 裁剪菲号表外键约束
-- ============================================

-- 菲号关联裁剪任务
ALTER TABLE t_cutting_bundle
ADD CONSTRAINT fk_cutting_bundle_task
FOREIGN KEY (cutting_task_id) REFERENCES t_cutting_task(id)
ON DELETE CASCADE ON UPDATE CASCADE;

-- 菲号关联生产订单
ALTER TABLE t_cutting_bundle
ADD CONSTRAINT fk_cutting_bundle_order
FOREIGN KEY (production_order_id) REFERENCES t_production_order(id)
ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================
-- 5. 扫码记录表外键约束
-- ============================================

-- 扫码记录关联生产订单
ALTER TABLE t_scan_record
ADD CONSTRAINT fk_scan_record_order
FOREIGN KEY (order_id) REFERENCES t_production_order(id)
ON DELETE CASCADE ON UPDATE CASCADE;

-- 扫码记录关联菲号
ALTER TABLE t_scan_record
ADD CONSTRAINT fk_scan_record_bundle
FOREIGN KEY (cutting_bundle_id) REFERENCES t_cutting_bundle(id)
ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================
-- 6. 入库表外键约束
-- ============================================

-- 入库关联生产订单
ALTER TABLE t_product_warehousing
ADD CONSTRAINT fk_warehousing_order
FOREIGN KEY (order_id) REFERENCES t_production_order(id)
ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================
-- 7. 出库表外键约束
-- ============================================

-- 出库关联生产订单
ALTER TABLE t_product_outstock
ADD CONSTRAINT fk_outstock_order
FOREIGN KEY (order_id) REFERENCES t_production_order(id)
ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================
-- 8. 工资结算表外键约束
-- ============================================

-- 工资结算关联生产订单
ALTER TABLE t_payroll_settlement
ADD CONSTRAINT fk_payroll_order
FOREIGN KEY (order_id) REFERENCES t_production_order(id)
ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================
-- 9. 物料对账表外键约束
-- ============================================

-- 物料对账关联物料采购
ALTER TABLE t_material_reconciliation
ADD CONSTRAINT fk_material_recon_purchase
FOREIGN KEY (purchase_id) REFERENCES t_material_purchase(id)
ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================
-- 10. 款式BOM表外键约束
-- ============================================

-- BOM关联款式
ALTER TABLE t_style_bom
ADD CONSTRAINT fk_style_bom_style
FOREIGN KEY (style_id) REFERENCES t_style_info(id)
ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================
-- 11. 款式工序表外键约束
-- ============================================

-- 工序关联款式
ALTER TABLE t_style_process
ADD CONSTRAINT fk_style_process_style
FOREIGN KEY (style_id) REFERENCES t_style_info(id)
ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================
-- 12. 款式尺码表外键约束
-- ============================================

-- 尺码关联款式
ALTER TABLE t_style_size
ADD CONSTRAINT fk_style_size_style
FOREIGN KEY (style_id) REFERENCES t_style_info(id)
ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================
-- 13. 用户表外键约束
-- ============================================

-- 用户关联角色
ALTER TABLE t_user
ADD CONSTRAINT fk_user_role
FOREIGN KEY (role_id) REFERENCES t_role(id)
ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================
-- 14. 角色权限关联表外键约束
-- ============================================

-- 角色权限关联角色
ALTER TABLE t_role_permission
ADD CONSTRAINT fk_role_perm_role
FOREIGN KEY (role_id) REFERENCES t_role(id)
ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================
-- 外键约束添加完成
-- ============================================

-- 查看所有外键约束
-- SELECT 
--     TABLE_NAME,
--     CONSTRAINT_NAME,
--     COLUMN_NAME,
--     REFERENCED_TABLE_NAME,
--     REFERENCED_COLUMN_NAME
-- FROM 
--     INFORMATION_SCHEMA.KEY_COLUMN_USAGE
-- WHERE 
--     TABLE_SCHEMA = DATABASE()
--     AND REFERENCED_TABLE_NAME IS NOT NULL
-- ORDER BY 
--     TABLE_NAME, CONSTRAINT_NAME;
