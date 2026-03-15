-- ============================================================
-- 新增多部位面料成分字段（支持两件套/拼接款，如 Lower/Top 分别填写成分）
-- 格式：JSON 字符串 [{"part":"Lower","materials":"91.00% Polyester\n9.00% Spandex"},...]
-- ============================================================
SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 't_style_info'
    AND COLUMN_NAME  = 'fabric_composition_parts'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE `t_style_info` ADD COLUMN `fabric_composition_parts` TEXT DEFAULT NULL COMMENT ''多部位面料成分JSON:[{part,materials}]''',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
