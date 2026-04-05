-- 工序倍率字段：null 或 1 表示不参与倍率计算，有效工序费 = 单价 × 倍率
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = 't_style_process'
        AND COLUMN_NAME  = 'rate_multiplier') = 0,
    'ALTER TABLE `t_style_process` ADD COLUMN `rate_multiplier` DECIMAL(5,2) DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
