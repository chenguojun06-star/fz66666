-- 修复回料数量精度问题：将 return_quantity 从 INT 改为 DECIMAL(10,2)
-- 支持面辅料按实际小数数量（如 71.07m 布料）进行回料确认
-- 注意：禁止在 SET @s = IF(...) 动态SQL字符串内放任何字符串字面量，避免 Flyway SQL 解析截断

SET @s = IF(
    (SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_material_purchase'
       AND COLUMN_NAME = 'return_quantity') = 'int',
    'ALTER TABLE `t_material_purchase` MODIFY COLUMN `return_quantity` DECIMAL(10,2) DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
