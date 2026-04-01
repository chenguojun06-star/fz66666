-- 向 t_cutting_bundle 添加 bed_sub_no（子床次编号）列
-- 业务场景：同一订单追加裁剪时，床号保持不变，子编号递增（如 16 -> 16-1, 16-2）
-- 首次裁剪该列为 NULL（显示为整数 "16"），追加时从 1 开始（显示为 "16-1"）
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_cutting_bundle'
       AND COLUMN_NAME = 'bed_sub_no') = 0,
    'ALTER TABLE `t_cutting_bundle` ADD COLUMN `bed_sub_no` INT DEFAULT NULL AFTER `bed_no`',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
