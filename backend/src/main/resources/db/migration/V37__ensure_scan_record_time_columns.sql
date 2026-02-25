-- 安全网迁移：确保 t_scan_record 表包含 receive_time 和 confirm_time 列
-- 使用 PREPARED STATEMENT 实现幂等（列已存在则跳过）
-- 原始迁移为 V20260225b，此脚本为冗余保障

SET @db_name = DATABASE();

-- 1. receive_time
SELECT COUNT(*) INTO @col_exists
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 't_scan_record' AND COLUMN_NAME = 'receive_time';

SET @ddl = IF(@col_exists = 0,
    'ALTER TABLE t_scan_record ADD COLUMN receive_time DATETIME NULL COMMENT ''领取/开始时间''',
    'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. confirm_time
SELECT COUNT(*) INTO @col_exists
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 't_scan_record' AND COLUMN_NAME = 'confirm_time';

SET @ddl = IF(@col_exists = 0,
    'ALTER TABLE t_scan_record ADD COLUMN confirm_time DATETIME NULL COMMENT ''录入结果/完成时间''',
    'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
