-- 清理：删除误加在 t_production_order 上的 secondary_process_images 列
-- 该列原本应加在 t_secondary_process（款式二次工艺表），位置加错了
-- V20260501001 已执行（加了该列），本脚本做补偿回滚

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_production_order'
       AND COLUMN_NAME  = 'secondary_process_images') > 0,
    'ALTER TABLE `t_production_order` DROP COLUMN `secondary_process_images`',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
