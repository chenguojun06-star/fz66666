-- 添加 SKU 相关字段到 t_scan_record 表
-- Phase 3 SKU系统支持

USE fashion_supplychain;

-- 添加 sku_completed_count 字段（SKU完成数）
ALTER TABLE t_scan_record 
ADD COLUMN sku_completed_count INT DEFAULT 0 COMMENT 'SKU完成数' 
AFTER scan_mode;

-- 添加 sku_total_count 字段（SKU总数）
ALTER TABLE t_scan_record 
ADD COLUMN sku_total_count INT DEFAULT 0 COMMENT 'SKU总数' 
AFTER sku_completed_count;

-- 更新说明：这两个字段用于SKU模式下追踪每个SKU的完成进度
