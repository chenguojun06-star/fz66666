-- 将 t_style_size.tolerance 从 DECIMAL 改为 VARCHAR(50)
-- 支持公差填写任意文字符号（如"正负5"、"±0.5"等）
-- MySQL 自动将原有数值（如 0.50）隐式转换为字符串（"0.5"），数据不丢失

SET @s = IF(
    (SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_style_size'
       AND COLUMN_NAME = 'tolerance') = 'varchar',
    'SELECT 1',
    'ALTER TABLE `t_style_size` MODIFY COLUMN `tolerance` VARCHAR(50) DEFAULT NULL'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
