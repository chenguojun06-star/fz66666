-- 裁剪层级用料追踪 + 成品出库冲销字段 + 结算视图补充出库维度
-- 关联铁律：财务数据链路闭环（裁剪→入库→出库→余量全链路可视化）

-- ============================================================
-- 1. 裁剪任务持久化 cutting_quantity（原为 @TableField(exist=false) 临时字段）
-- ============================================================
SET @s = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_cutting_task' AND COLUMN_NAME='cutting_quantity'),
  'ALTER TABLE t_cutting_task ADD COLUMN cutting_quantity INT DEFAULT NULL COMMENT ''裁剪数量（分扎完成时从CuttingBundle汇总持久化）''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_cutting_task' AND COLUMN_NAME='cutting_bundle_count'),
  'ALTER TABLE t_cutting_task ADD COLUMN cutting_bundle_count INT DEFAULT NULL COMMENT ''裁剪扎数（分扎完成时持久化）''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 回填历史数据：从 t_cutting_bundle 汇总已分扎的裁剪任务
-- 注意：t_cutting_bundle 无 delete_flag 列（实体无 @TableLogic），不需要软删除过滤
UPDATE t_cutting_task ct
SET ct.cutting_quantity = (
    SELECT COALESCE(SUM(cb.quantity), 0)
    FROM t_cutting_bundle cb
    WHERE cb.production_order_id = ct.production_order_id
      AND cb.split_status != 'split_parent'
), ct.cutting_bundle_count = (
    SELECT COUNT(*)
    FROM t_cutting_bundle cb
    WHERE cb.production_order_id = ct.production_order_id
      AND cb.split_status != 'split_parent'
)
WHERE ct.status = 'bundled'
  AND ct.cutting_quantity IS NULL;

-- ============================================================
-- 2. 成品出库表 t_product_outstock 新增冲销字段（对齐 ProductWarehousing）
-- ============================================================
SET @s = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_outstock' AND COLUMN_NAME='reversal_id'),
  'ALTER TABLE t_product_outstock ADD COLUMN reversal_id VARCHAR(64) DEFAULT NULL COMMENT ''冲销关联原出库记录ID''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_outstock' AND COLUMN_NAME='reversed_by_id'),
  'ALTER TABLE t_product_outstock ADD COLUMN reversed_by_id VARCHAR(64) DEFAULT NULL COMMENT ''原记录被冲销新记录ID''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_outstock' AND COLUMN_NAME='reversal_status'),
  'ALTER TABLE t_product_outstock ADD COLUMN reversal_status VARCHAR(20) DEFAULT NULL COMMENT ''冲销状态: NONE/REVERSED''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_outstock' AND COLUMN_NAME='reversal_reason'),
  'ALTER TABLE t_product_outstock ADD COLUMN reversal_reason VARCHAR(500) DEFAULT NULL COMMENT ''冲销原因''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 回填默认值
UPDATE t_product_outstock SET reversal_status = 'NONE' WHERE reversal_status IS NULL;

-- 冲销状态索引
SET @idx = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_outstock' AND INDEX_NAME='idx_po_reversal_status');
SET @s_idx = IF(@idx=0, 'ALTER TABLE t_product_outstock ADD INDEX idx_po_reversal_status (reversal_status)', 'SELECT 1');
PREPARE stmt FROM @s_idx; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- 3. BillAggregation uk_source 修复：删除旧唯一索引，重建含 delete_flag 的唯一索引
--    解决：软删除后同来源无法重新创建账单的问题
-- ============================================================
SET @idx = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_bill_aggregation' AND INDEX_NAME='uk_source');
SET @s_drop = IF(@idx>0, 'ALTER TABLE t_bill_aggregation DROP INDEX uk_source', 'SELECT 1');
PREPARE stmt FROM @s_drop; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 重建唯一索引：仅对未删除记录生效（delete_flag=0）
-- MySQL 不支持部分索引(partial index)，但可以用 delete_flag=0 作为常规过滤条件
-- 这里改用普通索引 + 应用层幂等检查（pushBill 已有 .eq(deleteFlag, 0) 查询）
SET @s_add = IF(@idx>=0, 'ALTER TABLE t_bill_aggregation ADD INDEX idx_source_tenant (source_type, source_id, tenant_id, delete_flag)', 'SELECT 1');
PREPARE stmt FROM @s_add; EXECUTE stmt; DEALLOCATE PREPARE stmt;
