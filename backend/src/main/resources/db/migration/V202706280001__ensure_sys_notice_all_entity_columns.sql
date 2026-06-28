-- ================================================================
-- V202706280001: 综合修复 t_sys_notice 字段缺失导致 MyBatis setting parameters 错误
--
-- 根因（2026-06-28 云端日志 backend-1747）：
--   SysNotice Entity 在 2026-06-25 commit a6681c3d7 新增了 actionPayload 和 styleImage 两个字段，
--   配套迁移 V202706250001/V202706250002 使用 DELIMITER $$ + CREATE PROCEDURE 写法，
--   该写法在 Flyway 中存在静默失败风险（项目历史踩坑：END//; 解析错误）。
--   SysNoticeOrchestrator 多处调用 notice.setStyleImage() 写入不存在的列，
--   触发 MyBatis "The error occurred while setting parameters"。
--
-- 修复策略：
--   1. 使用 PREPARE/EXECUTE/DEALLOCATE 模式（参考 V202705031800 已验证可靠的写法）
--   2. 一次性确保 SysNotice Entity 全部 14 个字段在 DB 中存在
--   3. 修复 content VARCHAR(512) → TEXT（防止超长内容截断）
--   4. 修复 to_name 无默认值（MindPushOrchestrator 显式 setToName("")）
--   5. 完全幂等：所有操作前用 INFORMATION_SCHEMA 检查
--
-- 涵盖字段（对应 SysNotice.java）：
--   id, tenant_id, to_name, from_name, order_no, title, content,
--   notice_type, is_read, urge_record_id, action_type,
--   action_payload, style_image, created_at
-- ================================================================

SET @dbname = DATABASE();

-- ----------------------------------------------------------------
-- 0. 确保表存在（兜底：若 V202705031800 因链断裂未执行，这里再保险一次）
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS t_sys_notice (
    id BIGINT NOT NULL AUTO_INCREMENT,
    tenant_id BIGINT,
    to_name VARCHAR(100) DEFAULT NULL,
    from_name VARCHAR(64) DEFAULT NULL,
    order_no VARCHAR(64) DEFAULT NULL,
    title VARCHAR(200) DEFAULT NULL,
    content TEXT,
    notice_type VARCHAR(50) DEFAULT NULL,
    is_read TINYINT(1) NOT NULL DEFAULT 0,
    urge_record_id VARCHAR(64) DEFAULT NULL,
    action_type VARCHAR(32) DEFAULT NULL,
    action_payload TEXT,
    style_image VARCHAR(512) DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_sn_tenant (tenant_id),
    INDEX idx_sn_to_name (to_name),
    INDEX idx_sn_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------
-- 1. 逐字段确保存在（CREATE TABLE IF NOT EXISTS 不会补字段，需独立 ADD COLUMN）
-- ----------------------------------------------------------------

-- to_name（注：PREPARE 动态 SQL 内不写 DEFAULT NULL，MySQL 默认即 NULL）
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_sys_notice' AND COLUMN_NAME='to_name');
SET @s = IF(@c=0, 'ALTER TABLE t_sys_notice ADD COLUMN to_name VARCHAR(100) AFTER tenant_id', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- from_name
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_sys_notice' AND COLUMN_NAME='from_name');
SET @s = IF(@c=0, 'ALTER TABLE t_sys_notice ADD COLUMN from_name VARCHAR(64) AFTER to_name', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- order_no
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_sys_notice' AND COLUMN_NAME='order_no');
SET @s = IF(@c=0, 'ALTER TABLE t_sys_notice ADD COLUMN order_no VARCHAR(64) AFTER from_name', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- title
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_sys_notice' AND COLUMN_NAME='title');
SET @s = IF(@c=0, 'ALTER TABLE t_sys_notice ADD COLUMN title VARCHAR(200) AFTER order_no', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- content
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_sys_notice' AND COLUMN_NAME='content');
SET @s = IF(@c=0, 'ALTER TABLE t_sys_notice ADD COLUMN content TEXT AFTER title', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- notice_type
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_sys_notice' AND COLUMN_NAME='notice_type');
SET @s = IF(@c=0, 'ALTER TABLE t_sys_notice ADD COLUMN notice_type VARCHAR(50) AFTER content', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- is_read
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_sys_notice' AND COLUMN_NAME='is_read');
SET @s = IF(@c=0, 'ALTER TABLE t_sys_notice ADD COLUMN is_read TINYINT(1) NOT NULL DEFAULT 0 AFTER notice_type', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- urge_record_id
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_sys_notice' AND COLUMN_NAME='urge_record_id');
SET @s = IF(@c=0, 'ALTER TABLE t_sys_notice ADD COLUMN urge_record_id VARCHAR(64) AFTER is_read', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- action_type
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_sys_notice' AND COLUMN_NAME='action_type');
SET @s = IF(@c=0, 'ALTER TABLE t_sys_notice ADD COLUMN action_type VARCHAR(32) AFTER urge_record_id', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- action_payload  ★ 本次重点修复（V202706250001 DELIMITER 写法可能静默失败）
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_sys_notice' AND COLUMN_NAME='action_payload');
SET @s = IF(@c=0, 'ALTER TABLE t_sys_notice ADD COLUMN action_payload TEXT AFTER action_type', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- style_image  ★ 本次重点修复（V202706250002 DELIMITER 写法可能静默失败）
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_sys_notice' AND COLUMN_NAME='style_image');
SET @s = IF(@c=0, 'ALTER TABLE t_sys_notice ADD COLUMN style_image VARCHAR(512) AFTER action_payload', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- created_at
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_sys_notice' AND COLUMN_NAME='created_at');
SET @s = IF(@c=0, 'ALTER TABLE t_sys_notice ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER style_image', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ----------------------------------------------------------------
-- 2. 修复 content 类型（VARCHAR(512) → TEXT）
--    根因：V20260322.02 原始建表为 VARCHAR(512) NOT NULL，超长内容被截断
-- ----------------------------------------------------------------
SET @content_is_varchar = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_sys_notice'
      AND COLUMN_NAME='content' AND DATA_TYPE='varchar'
);
SET @s = IF(@content_is_varchar > 0,
    'ALTER TABLE t_sys_notice MODIFY COLUMN content TEXT',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ----------------------------------------------------------------
-- 3. 修复 to_name 默认值
--    根因：MindPushOrchestrator 显式 setToName("")，若列 NOT NULL 无默认值会报错
-- ----------------------------------------------------------------
SET @to_name_needs_fix = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_sys_notice'
      AND COLUMN_NAME='to_name' AND COLUMN_DEFAULT IS NULL
);
SET @s = IF(@to_name_needs_fix > 0,
    'ALTER TABLE t_sys_notice MODIFY COLUMN to_name VARCHAR(100) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ----------------------------------------------------------------
-- 4. 补关键索引（提升 SmartNotifyJob/收件箱查询性能）
-- ----------------------------------------------------------------
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_sys_notice' AND INDEX_NAME='idx_sn_tenant');
SET @s = IF(@c=0, 'CREATE INDEX idx_sn_tenant ON t_sys_notice (tenant_id)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_sys_notice' AND INDEX_NAME='idx_sn_to_name');
SET @s = IF(@c=0, 'CREATE INDEX idx_sn_to_name ON t_sys_notice (to_name)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_sys_notice' AND INDEX_NAME='idx_sn_created_at');
SET @s = IF(@c=0, 'CREATE INDEX idx_sn_created_at ON t_sys_notice (created_at)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_sys_notice' AND INDEX_NAME='idx_sn_tenant_type_read');
SET @s = IF(@c=0, 'CREATE INDEX idx_sn_tenant_type_read ON t_sys_notice (tenant_id, notice_type, is_read)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
