-- V202609140002: t_stage_config 支持「按款独立」——新增 style_id，默认基线 2 天
--
-- 背景：
--   环节配置从「全厂一套」升级为「按款独立」：
--   - style_id = ''       → 工厂默认基线（在工序模板编辑里配置），所有未单独配置的款兜底
--   - style_id = <款ID>   → 该款式独有的覆盖配置（在样衣详情工序单价里配置）
--   默认基线时长设为 2 天（原种子 0 天），未配置的款按 2 天．
--   可操作人/超期预警均按订单所属款式解析。
--
-- 幂等写法（P0 铁律 1 / D-004）：information_schema 判断列/索引是否存在；
--   动态 SQL 内不带 COMMENT 字符串字面量，用独立 ALTER 回填注释。

-- =============================================
-- 1. 新增 style_id 列（空串=工厂默认基线）
-- =============================================
SET @c_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_stage_config' AND COLUMN_NAME='style_id');
SET @s_add = IF(@c_exists=0,
    'ALTER TABLE t_stage_config ADD COLUMN style_id VARCHAR(64) NOT NULL DEFAULT '''' AFTER stage_name',
    'SELECT 1');
PREPARE stmt_add FROM @s_add; EXECUTE stmt_add; DEALLOCATE PREPARE stmt_add;

-- 回填列注释（D-004：动态 SQL 内禁止字符串字面量 COMMENT）
ALTER TABLE t_stage_config MODIFY COLUMN style_id VARCHAR(64) NOT NULL DEFAULT '' COMMENT '款式ID，空串=工厂默认基线；按款独立配置';

-- =============================================
-- 2. 重建唯一键为 (tenant_id, style_id, stage_name)
-- =============================================
SET @i_old = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_stage_config' AND INDEX_NAME='uk_tenant_stage');
SET @s_drop_old = IF(@i_old=0,
    'SELECT 1',
    'ALTER TABLE t_stage_config DROP INDEX uk_tenant_stage');
PREPARE stmt_drop_old FROM @s_drop_old; EXECUTE stmt_drop_old; DEALLOCATE PREPARE stmt_drop_old;

SET @i_new = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_stage_config' AND INDEX_NAME='uk_tenant_style_stage');
SET @s_add_new = IF(@i_new=0,
    'ALTER TABLE t_stage_config ADD UNIQUE KEY uk_tenant_style_stage (tenant_id, style_id, stage_name)',
    'SELECT 1');
PREPARE stmt_add_new FROM @s_add_new; EXECUTE stmt_add_new; DEALLOCATE PREPARE stmt_add_new;

-- =============================================
-- 3. 默认基线时长设为 2 天（仅对被升级的原种子：style_id='' 且仍为 0 的行）
-- =============================================
UPDATE t_stage_config
   SET expected_days = 2
 WHERE style_id = '' AND expected_days = 0 AND delete_flag = 0;