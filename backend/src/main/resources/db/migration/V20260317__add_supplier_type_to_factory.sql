-- 为 t_factory 表添加 supplier_type 字段
-- 供应商类型：MATERIAL=面辅料供应商，OUTSOURCE=外发厂
-- ⚠️ 改为幂等写法（INFORMATION_SCHEMA 判断），支持 FLYWAY_ENABLED=true 自动执行
SET @s_supplier_type = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_factory' AND COLUMN_NAME = 'supplier_type') = 0,
    'ALTER TABLE `t_factory` ADD COLUMN `supplier_type` VARCHAR(20) NULL COMMENT ''供应商类型：MATERIAL-面辅料供应商，OUTSOURCE-外发厂'' AFTER `factory_type`',
    'SELECT 1'
);
PREPARE stmt FROM @s_supplier_type; EXECUTE stmt; DEALLOCATE PREPARE stmt;
