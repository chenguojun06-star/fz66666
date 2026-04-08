-- 拆菲工序级拆分：记录拆分发生在哪个工序节点
-- split_process_name: 拆分时的工序名称（如"车缝"）
-- split_process_order: 拆分时的工序序号，用于后续扫码判断是否允许父菲号继续扫码

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_cutting_bundle' AND COLUMN_NAME='split_process_name')=0,
    'ALTER TABLE `t_cutting_bundle` ADD COLUMN `split_process_name` VARCHAR(100) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_cutting_bundle' AND COLUMN_NAME='split_process_order')=0,
    'ALTER TABLE `t_cutting_bundle` ADD COLUMN `split_process_order` INT DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
