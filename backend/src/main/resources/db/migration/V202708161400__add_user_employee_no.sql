-- ============================================================
-- V202708161400 用户表增加工号列 employee_no
-- 背景：人员管理页面对齐设计稿，需展示工号列 + 支持工号筛选
-- 影响范围：t_user 表结构，新增列默认 NULL（存量用户无工号）
-- 回滚方案：ALTER TABLE t_user DROP COLUMN employee_no;
-- ============================================================

-- MySQL 8.0 不支持 ADD COLUMN IF NOT EXISTS，用 information_schema 条件执行
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 't_user'
    AND COLUMN_NAME = 'employee_no'
);
SET @ddl = IF(@col_exists = 0,
  'ALTER TABLE t_user ADD COLUMN employee_no VARCHAR(50) DEFAULT NULL COMMENT ''工号（租户内唯一性由业务层维护）''',
  'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
