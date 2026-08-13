-- =====================================================================
-- 样衣详情页 - 基础信息 Tab 重构：补齐 t_style_info 扩展字段
-- 新增字段：product_type / theme / designer / supplier / supplier_id /
--          supplier_contact_person / supplier_contact_phone
-- 所有 ALTER 均带 IF NOT EXISTS 检查（MariaDB 10.5+ / MySQL 8.0 支持）
-- 兼容旧库：列已存在时静默跳过
-- =====================================================================

ALTER TABLE t_style_info
    ADD COLUMN IF NOT EXISTS `product_type` VARCHAR(32) NULL DEFAULT NULL COMMENT '商品类型：FINISHED=成品，SEMI_FINISHED=半成品' AFTER `season`;

ALTER TABLE t_style_info
    ADD COLUMN IF NOT EXISTS `theme` VARCHAR(128) NULL DEFAULT NULL COMMENT '商品主题（字典 dict_type=style_theme）' AFTER `product_type`;

ALTER TABLE t_style_info
    ADD COLUMN IF NOT EXISTS `designer` VARCHAR(64) NULL DEFAULT NULL COMMENT '设计师（独立字段，原 sampleNo 保留向后兼容）' AFTER `theme`;

ALTER TABLE t_style_info
    ADD COLUMN IF NOT EXISTS `supplier` VARCHAR(128) NULL DEFAULT NULL COMMENT '供应商名称（冗余存储）' AFTER `customer`;

ALTER TABLE t_style_info
    ADD COLUMN IF NOT EXISTS `supplier_id` VARCHAR(64) NULL DEFAULT NULL COMMENT '供应商ID（关联 t_factory.id）' AFTER `supplier`;

ALTER TABLE t_style_info
    ADD COLUMN IF NOT EXISTS `supplier_contact_person` VARCHAR(64) NULL DEFAULT NULL COMMENT '供应商联系人' AFTER `supplier_id`;

ALTER TABLE t_style_info
    ADD COLUMN IF NOT EXISTS `supplier_contact_phone` VARCHAR(32) NULL DEFAULT NULL COMMENT '供应商联系电话' AFTER `supplier_contact_person`;

-- 同步索引（供应商ID查询使用）
SET @sql := IF(
    (SELECT COUNT(*) FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_style_info'
       AND INDEX_NAME = 'idx_style_info_supplier_id') = 0,
    'ALTER TABLE t_style_info ADD INDEX idx_style_info_supplier_id (supplier_id)',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
