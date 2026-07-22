-- ==================================================================
-- V202707221000: 为 t_ai_long_memory 补时序版本化字段
--   valid_from / valid_to / superseded_by
-- ==================================================================
-- 背景（P1-1 t_ai_long_memory 时序字段升级 - Graphiti 时序知识图谱方向）：
--   当前 AiLongMemory 仅有 create_time/update_time，无时序版本化字段。
--   前沿方向（Graphiti 时序知识图谱）：记忆应有 valid_from/valid_to/superseded_by
--   三字段，实现"记忆版本化"——新事实写入时旧事实自动失效
--   （valid_to=now, superseded_by=新id），查询时只返回 valid_to IS NULL
--   的有效记忆。
--
-- 字段说明：
--   valid_from     — 记忆有效期开始（默认 CURRENT_TIMESTAMP）
--   valid_to       — 记忆有效期结束（NULL=当前有效）
--   superseded_by  — 被哪条新记忆替代（新记忆的 id）
--
-- 索引：
--   idx_valid_to     (tenant_id, valid_to)       — 查询有效记忆
--   idx_superseded   (tenant_id, superseded_by)  — 查询被替代的记忆
--
-- 安全模板参考：V202707191000__add_is_own_factory_to_shipment_reconciliation.sql
--   用 information_schema + PREPARE/EXECUTE 实现幂等（禁止 IF NOT EXISTS，MySQL 8.0 不支持）
--   不在 SET @s 中包含 COMMENT 'xxx'（Flyway 静默失败），COMMENT 用独立 ALTER MODIFY 语句添加
-- 多租户安全（P0 铁律4）：
--   索引均带 tenant_id 前缀；UPDATE 带 WHERE 限制，避免跨租户污染
-- ==================================================================

-- ── 1. 幂等添加 valid_from 列（若已存在则跳过） ──
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_ai_long_memory'
       AND COLUMN_NAME  = 'valid_from') = 0,
    'ALTER TABLE `t_ai_long_memory` ADD COLUMN `valid_from` DATETIME DEFAULT CURRENT_TIMESTAMP',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 为 valid_from 列追加 COMMENT（独立语句，不在 SET @s 内）
ALTER TABLE `t_ai_long_memory` MODIFY COLUMN `valid_from` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '记忆有效期开始';

-- ── 2. 幂等添加 valid_to 列（若已存在则跳过） ──
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_ai_long_memory'
       AND COLUMN_NAME  = 'valid_to') = 0,
    'ALTER TABLE `t_ai_long_memory` ADD COLUMN `valid_to` DATETIME DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 为 valid_to 列追加 COMMENT（独立语句，不在 SET @s 内）
ALTER TABLE `t_ai_long_memory` MODIFY COLUMN `valid_to` DATETIME DEFAULT NULL COMMENT '记忆有效期结束（NULL=当前有效）';

-- ── 3. 幂等添加 superseded_by 列（若已存在则跳过） ──
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_ai_long_memory'
       AND COLUMN_NAME  = 'superseded_by') = 0,
    'ALTER TABLE `t_ai_long_memory` ADD COLUMN `superseded_by` BIGINT DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 为 superseded_by 列追加 COMMENT（独立语句，不在 SET @s 内）
ALTER TABLE `t_ai_long_memory` MODIFY COLUMN `superseded_by` BIGINT DEFAULT NULL COMMENT '被哪条新记忆替代（新记忆的id）';

-- ── 4. 幂等添加 idx_valid_to 索引（tenant_id, valid_to） ──
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_ai_long_memory'
       AND INDEX_NAME   = 'idx_valid_to') = 0,
    'ALTER TABLE `t_ai_long_memory` ADD INDEX `idx_valid_to` (`tenant_id`, `valid_to`)',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 5. 幂等添加 idx_superseded 索引（tenant_id, superseded_by） ──
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_ai_long_memory'
       AND INDEX_NAME   = 'idx_superseded') = 0,
    'ALTER TABLE `t_ai_long_memory` ADD INDEX `idx_superseded` (`tenant_id`, `superseded_by`)',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 6. 回填存量数据：valid_from 为空时取 create_time ──
-- 幂等：仅回填 valid_from IS NULL 的记录，可重复执行
UPDATE `t_ai_long_memory`
SET `valid_from` = `create_time`
WHERE `valid_from` IS NULL
  AND `create_time` IS NOT NULL;
