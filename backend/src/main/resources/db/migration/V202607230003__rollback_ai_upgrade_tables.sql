-- ============================================================
-- 回滚 AI 升级中心的5张表 + t_skill_template 的7个市场字段 + 1个索引
--
-- 背景：
--   V202607230001 创建了 5 张 AI 升级表（browser_agent/visual_ai/fashion_ai_asset/scheduling_optimization/digital_twin_snapshot）
--   V202607230002 给 t_skill_template 加了 7 个市场字段 + 1 个索引
--   业务决策：删除 AiUpgradeCenter 页面与6个后端模块，能力下沉到现有模块
--   因此需要回滚这些表和字段（保留原迁移文件不删，遵守 P0 #1 不修改已应用迁移）
--
-- 幂等写法：用 information_schema 检查存在性，存在才 DROP（P0 #1 / D-004）
-- ============================================================

-- =============================================
-- 1. DROP t_browser_agent_task
-- =============================================
SET @t1_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_browser_agent_task');
SET @s_drop_t1 = IF(@t1_exists=1, 'DROP TABLE t_browser_agent_task', 'SELECT 1');
PREPARE stmt_drop_t1 FROM @s_drop_t1; EXECUTE stmt_drop_t1; DEALLOCATE PREPARE stmt_drop_t1;

-- =============================================
-- 2. DROP t_visual_ai_inspection
-- =============================================
SET @t2_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_visual_ai_inspection');
SET @s_drop_t2 = IF(@t2_exists=1, 'DROP TABLE t_visual_ai_inspection', 'SELECT 1');
PREPARE stmt_drop_t2 FROM @s_drop_t2; EXECUTE stmt_drop_t2; DEALLOCATE PREPARE stmt_drop_t2;

-- =============================================
-- 3. DROP t_fashion_ai_asset
-- =============================================
SET @t3_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_fashion_ai_asset');
SET @s_drop_t3 = IF(@t3_exists=1, 'DROP TABLE t_fashion_ai_asset', 'SELECT 1');
PREPARE stmt_drop_t3 FROM @s_drop_t3; EXECUTE stmt_drop_t3; DEALLOCATE PREPARE stmt_drop_t3;

-- =============================================
-- 4. DROP t_scheduling_optimization
-- =============================================
SET @t4_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scheduling_optimization');
SET @s_drop_t4 = IF(@t4_exists=1, 'DROP TABLE t_scheduling_optimization', 'SELECT 1');
PREPARE stmt_drop_t4 FROM @s_drop_t4; EXECUTE stmt_drop_t4; DEALLOCATE PREPARE stmt_drop_t4;

-- =============================================
-- 5. DROP t_digital_twin_snapshot
-- =============================================
SET @t5_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_digital_twin_snapshot');
SET @s_drop_t5 = IF(@t5_exists=1, 'DROP TABLE t_digital_twin_snapshot', 'SELECT 1');
PREPARE stmt_drop_t5 FROM @s_drop_t5; EXECUTE stmt_drop_t5; DEALLOCATE PREPARE stmt_drop_t5;

-- =============================================
-- 6. DROP INDEX idx_skill_market on t_skill_template
-- =============================================
SET @idx1_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_skill_template' AND INDEX_NAME='idx_skill_market');
SET @si1 = IF(@idx1_exists=1, 'ALTER TABLE t_skill_template DROP INDEX idx_skill_market', 'SELECT 1');
PREPARE stmti1 FROM @si1; EXECUTE stmti1; DEALLOCATE PREPARE stmti1;

-- =============================================
-- 7. DROP 7 columns from t_skill_template
-- =============================================

-- is_shared
SET @c1_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_skill_template' AND COLUMN_NAME='is_shared');
SET @s1 = IF(@c1_exists=1, 'ALTER TABLE t_skill_template DROP COLUMN is_shared', 'SELECT 1');
PREPARE stmt1 FROM @s1; EXECUTE stmt1; DEALLOCATE PREPARE stmt1;

-- share_scope
SET @c2_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_skill_template' AND COLUMN_NAME='share_scope');
SET @s2 = IF(@c2_exists=1, 'ALTER TABLE t_skill_template DROP COLUMN share_scope', 'SELECT 1');
PREPARE stmt2 FROM @s2; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;

-- market_category
SET @c3_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_skill_template' AND COLUMN_NAME='market_category');
SET @s3 = IF(@c3_exists=1, 'ALTER TABLE t_skill_template DROP COLUMN market_category', 'SELECT 1');
PREPARE stmt3 FROM @s3; EXECUTE stmt3; DEALLOCATE PREPARE stmt3;

-- market_tags
SET @c4_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_skill_template' AND COLUMN_NAME='market_tags');
SET @s4 = IF(@c4_exists=1, 'ALTER TABLE t_skill_template DROP COLUMN market_tags', 'SELECT 1');
PREPARE stmt4 FROM @s4; EXECUTE stmt4; DEALLOCATE PREPARE stmt4;

-- install_count
SET @c5_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_skill_template' AND COLUMN_NAME='install_count');
SET @s5 = IF(@c5_exists=1, 'ALTER TABLE t_skill_template DROP COLUMN install_count', 'SELECT 1');
PREPARE stmt5 FROM @s5; EXECUTE stmt5; DEALLOCATE PREPARE stmt5;

-- author_name
SET @c6_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_skill_template' AND COLUMN_NAME='author_name');
SET @s6 = IF(@c6_exists=1, 'ALTER TABLE t_skill_template DROP COLUMN author_name', 'SELECT 1');
PREPARE stmt6 FROM @s6; EXECUTE stmt6; DEALLOCATE PREPARE stmt6;

-- origin_skill_id
SET @c7_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_skill_template' AND COLUMN_NAME='origin_skill_id');
SET @s7 = IF(@c7_exists=1, 'ALTER TABLE t_skill_template DROP COLUMN origin_skill_id', 'SELECT 1');
PREPARE stmt7 FROM @s7; EXECUTE stmt7; DEALLOCATE PREPARE stmt7;
