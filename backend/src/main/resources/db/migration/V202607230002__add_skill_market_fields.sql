-- ============================================================
-- Skills 市场：为 t_skill_template 增加市场共享字段
-- 支持 技能导入导出 + 跨租户分享
-- 幂等写法：用 information_schema + PREPARE/EXECUTE（P0 #1 禁止 IF NOT EXISTS）
-- ============================================================

-- 1. is_shared：是否已分享到市场
SET @c1_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_skill_template' AND COLUMN_NAME='is_shared');
SET @s1 = IF(@c1_exists=0,
    'ALTER TABLE t_skill_template ADD COLUMN is_shared TINYINT(1) NOT NULL DEFAULT 0 COMMENT ''是否已分享到市场 0否1是''',
    'SELECT 1');
PREPARE stmt1 FROM @s1; EXECUTE stmt1; DEALLOCATE PREPARE stmt1;

-- 2. share_scope：分享范围 PRIVATE / TENANT / PUBLIC
SET @c2_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_skill_template' AND COLUMN_NAME='share_scope');
SET @s2 = IF(@c2_exists=0,
    'ALTER TABLE t_skill_template ADD COLUMN share_scope VARCHAR(16) NOT NULL DEFAULT ''PRIVATE'' COMMENT ''分享范围 PRIVATE/TENANT/PUBLIC''',
    'SELECT 1');
PREPARE stmt2 FROM @s2; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;

-- 3. market_category：市场分类
SET @c3_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_skill_template' AND COLUMN_NAME='market_category');
SET @s3 = IF(@c3_exists=0,
    'ALTER TABLE t_skill_template ADD COLUMN market_category VARCHAR(32) NULL COMMENT ''市场分类 production/finance/warehouse/quality/ecommerce/general''',
    'SELECT 1');
PREPARE stmt3 FROM @s3; EXECUTE stmt3; DEALLOCATE PREPARE stmt3;

-- 4. market_tags：市场标签（逗号分隔）
SET @c4_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_skill_template' AND COLUMN_NAME='market_tags');
SET @s4 = IF(@c4_exists=0,
    'ALTER TABLE t_skill_template ADD COLUMN market_tags VARCHAR(256) NULL COMMENT ''市场标签，逗号分隔''',
    'SELECT 1');
PREPARE stmt4 FROM @s4; EXECUTE stmt4; DEALLOCATE PREPARE stmt4;

-- 5. install_count：安装次数
SET @c5_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_skill_template' AND COLUMN_NAME='install_count');
SET @s5 = IF(@c5_exists=0,
    'ALTER TABLE t_skill_template ADD COLUMN install_count INT NOT NULL DEFAULT 0 COMMENT ''被安装次数''',
    'SELECT 1');
PREPARE stmt5 FROM @s5; EXECUTE stmt5; DEALLOCATE PREPARE stmt5;

-- 6. author_name：原作者名称
SET @c6_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_skill_template' AND COLUMN_NAME='author_name');
SET @s6 = IF(@c6_exists=0,
    'ALTER TABLE t_skill_template ADD COLUMN author_name VARCHAR(64) NULL COMMENT ''原作者名称''',
    'SELECT 1');
PREPARE stmt6 FROM @s6; EXECUTE stmt6; DEALLOCATE PREPARE stmt6;

-- 7. origin_skill_id：来源技能ID（安装副本记录原始ID）
SET @c7_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_skill_template' AND COLUMN_NAME='origin_skill_id');
SET @s7 = IF(@c7_exists=0,
    'ALTER TABLE t_skill_template ADD COLUMN origin_skill_id VARCHAR(64) NULL COMMENT ''来源技能ID（安装副本记录原始ID）''',
    'SELECT 1');
PREPARE stmt7 FROM @s7; EXECUTE stmt7; DEALLOCATE PREPARE stmt7;

-- 索引：按分享范围 + 分类查询市场技能
SET @idx1_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_skill_template' AND INDEX_NAME='idx_skill_market');
SET @si1 = IF(@idx1_exists=0,
    'CREATE INDEX idx_skill_market ON t_skill_template (share_scope, market_category, is_shared)',
    'SELECT 1');
PREPARE stmti1 FROM @si1; EXECUTE stmti1; DEALLOCATE PREPARE stmti1;
