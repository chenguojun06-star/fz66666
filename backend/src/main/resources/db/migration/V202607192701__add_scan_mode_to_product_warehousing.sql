-- U编码入库功能：t_product_warehousing 新增 scan_mode 列
-- 区分菲号扫码入库(bundle) vs U编码扫码入库(ucode)
-- 注意：动态SQL中禁止使用 DEFAULT ''text''，Flyway解析器会截断导致列永远不被添加
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='scan_mode')=0,
    'ALTER TABLE `t_product_warehousing` ADD COLUMN `scan_mode` VARCHAR(20) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 回填历史记录的扫码模式为 bundle（菲号模式）
UPDATE `t_product_warehousing` SET `scan_mode` = 'bundle' WHERE `scan_mode` IS NULL;
