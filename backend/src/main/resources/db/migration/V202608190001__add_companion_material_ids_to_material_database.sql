-- ============================================================
-- V202608190001: 给 t_material_database 加 companion_material_ids 字段
--
-- 用途：实现"主面料关联拉链辅料自动带入"功能（P2-6）
--   - 字段类型 VARCHAR(1024)，存储 JSON 数组字符串
--   - 数组元素为关联物料的 id（UUID）
--   - 例：["uuid1","uuid2","uuid3"] 表示该主面料关联 3 个辅料（拉链/纽扣等）
--
-- 业务流程：
--   1. 物料资料维护弹窗配置主面料的"关联辅料"（多选）
--   2. 样衣 BOM 选主面料时，前端调 GET /material/database/{id}/companions 拉取关联辅料
--   3. 自动追加辅料为 BOM 新行，避免漏采购
--
-- 幂等安全：用 INFORMATION_SCHEMA 检查列是否存在，避免重复添加
-- ============================================================

-- Step 1: 检查列是否存在，不存在则添加
SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 't_material_database'
    AND COLUMN_NAME = 'companion_material_ids'
);

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE `t_material_database` ADD COLUMN `companion_material_ids` VARCHAR(1024) DEFAULT NULL COMMENT ''关联辅料ID数组JSON，如["uuid1","uuid2"]，用于BOM选主面料时自动带出辅料''',
  'SELECT ''companion_material_ids already exists'' AS info'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 2: 加索引便于按关联查询（可选，主要为后续反向查询"哪些主面料关联了某辅料"）
SET @idx_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 't_material_database'
    AND INDEX_NAME = 'idx_companion_material_ids'
);

SET @sql2 = IF(@idx_exists = 0,
  'ALTER TABLE `t_material_database` ADD INDEX `idx_companion_material_ids` (`companion_material_ids`(64))',
  'SELECT ''idx_companion_material_ids already exists'' AS info'
);

PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;
