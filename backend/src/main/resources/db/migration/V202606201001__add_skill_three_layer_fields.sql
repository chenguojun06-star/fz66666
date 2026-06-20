-- V202606201001: 为 t_skill_template 新增三层渐进式披露字段
--
-- 背景：
--   借鉴 Claude Agent SDK 2026-01 Skills 规范 + DeerFlow 2.0 Skill=Markdown，
--   将 SkillTemplate 从单文件 stepsJson 扩展为三层结构：
--     1. metadata 层（~50 tokens）  — 常驻上下文，name/description/triggers
--     2. SKILL.md 层（~500 tokens） — 命中后加载，完整技能文档
--     3. references 层（按需）       — 深度查询时加载，详细参考
--
-- 幂等写法：MySQL 8.0 不支持 ADD COLUMN IF NOT EXISTS，
--           使用 information_schema + PREPARE/EXECUTE 模式（参考 V202606181003）

-- =============================================
-- 1. metadata_yaml — metadata 层（YAML 格式，~50 tokens）
-- =============================================
SET @c_meta = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_skill_template' AND COLUMN_NAME='metadata_yaml');
SET @s_meta = IF(@c_meta=0,
    'ALTER TABLE t_skill_template ADD COLUMN metadata_yaml TEXT NULL DEFAULT NULL COMMENT ''metadata 层（~50 tokens，name/description/triggers，YAML）'' AFTER post_check',
    'SELECT 1');
PREPARE stmt_meta FROM @s_meta; EXECUTE stmt_meta; DEALLOCATE PREPARE stmt_meta;

-- =============================================
-- 2. skill_md — SKILL.md 层（Markdown，~500 tokens）
-- =============================================
SET @c_md = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_skill_template' AND COLUMN_NAME='skill_md');
SET @s_md = IF(@c_md=0,
    'ALTER TABLE t_skill_template ADD COLUMN skill_md TEXT NULL DEFAULT NULL COMMENT ''SKILL.md 层（~500 tokens，完整技能文档，Markdown）'' AFTER metadata_yaml',
    'SELECT 1');
PREPARE stmt_md FROM @s_md; EXECUTE stmt_md; DEALLOCATE PREPARE stmt_md;

-- =============================================
-- 3. references_json — references 层（JSON 数组，按需加载）
-- =============================================
SET @c_ref = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_skill_template' AND COLUMN_NAME='references_json');
SET @s_ref = IF(@c_ref=0,
    'ALTER TABLE t_skill_template ADD COLUMN references_json TEXT NULL DEFAULT NULL COMMENT ''references 层（按需加载的详细参考，JSON 数组）'' AFTER skill_md',
    'SELECT 1');
PREPARE stmt_ref FROM @s_ref; EXECUTE stmt_ref; DEALLOCATE PREPARE stmt_ref;

-- =============================================
-- 4. token_budget_metadata — metadata 层 token 预算
-- =============================================
SET @c_tbm = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_skill_template' AND COLUMN_NAME='token_budget_metadata');
SET @s_tbm = IF(@c_tbm=0,
    'ALTER TABLE t_skill_template ADD COLUMN token_budget_metadata INT NULL DEFAULT 50 COMMENT ''metadata 层 token 预算（默认 50）'' AFTER references_json',
    'SELECT 1');
PREPARE stmt_tbm FROM @s_tbm; EXECUTE stmt_tbm; DEALLOCATE PREPARE stmt_tbm;

-- =============================================
-- 5. token_budget_skill_md — SKILL.md 层 token 预算
-- =============================================
SET @c_tbs = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_skill_template' AND COLUMN_NAME='token_budget_skill_md');
SET @s_tbs = IF(@c_tbs=0,
    'ALTER TABLE t_skill_template ADD COLUMN token_budget_skill_md INT NULL DEFAULT 500 COMMENT ''SKILL.md 层 token 预算（默认 500）'' AFTER token_budget_metadata',
    'SELECT 1');
PREPARE stmt_tbs FROM @s_tbs; EXECUTE stmt_tbs; DEALLOCATE PREPARE stmt_tbs;

-- =============================================
-- 6. disclosure_level — 披露级别（MINIMAL/STANDARD/FULL）
-- =============================================
SET @c_dl = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_skill_template' AND COLUMN_NAME='disclosure_level');
SET @s_dl = IF(@c_dl=0,
    'ALTER TABLE t_skill_template ADD COLUMN disclosure_level VARCHAR(20) NULL DEFAULT ''STANDARD'' COMMENT ''披露级别：MINIMAL/STANDARD/FULL'' AFTER token_budget_skill_md',
    'SELECT 1');
PREPARE stmt_dl FROM @s_dl; EXECUTE stmt_dl; DEALLOCATE PREPARE stmt_dl;
