-- 次品看板：向 t_product_warehousing 添加返修状态跟踪字段
-- repair_status: pending_repair(待返修) / repairing(返修中) / repair_done(返修完成) / scrapped(报废)
-- repair_operator_name: 返修操作人姓名
-- repair_completed_time: 返修完成时间

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='repair_status')=0,
    'ALTER TABLE `t_product_warehousing` ADD COLUMN `repair_status` VARCHAR(30) DEFAULT NULL COMMENT ''返修状态: pending_repair/repairing/repair_done/scrapped''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='repair_operator_name')=0,
    'ALTER TABLE `t_product_warehousing` ADD COLUMN `repair_operator_name` VARCHAR(50) DEFAULT NULL COMMENT ''返修操作人姓名''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='repair_completed_time')=0,
    'ALTER TABLE `t_product_warehousing` ADD COLUMN `repair_completed_time` DATETIME DEFAULT NULL COMMENT ''返修完成时间''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 回填现有次品记录：unqualified_quantity > 0 且无 repair_status → 设为 pending_repair
UPDATE `t_product_warehousing`
SET `repair_status` = 'pending_repair'
WHERE `unqualified_quantity` > 0
  AND (`repair_status` IS NULL OR `repair_status` = '')
  AND `delete_flag` = 0;
