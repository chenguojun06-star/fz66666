-- V202607192304: 修复云端两个核心表缺列导致高频 WARN 日志风暴
-- 背景：
--   V202607192303 (t_cutting_task.factory_type) 和
--   V202607192200 (t_product_warehousing.repair_status 等) 均在 SET @s = IF(...)
--   中使用了 COMMENT '' 语法，Flyway SQL 解析器将 '' 视为字符串结束符，
--   导致 ALTER TABLE 语句被截断，ADD COLUMN 在云端实际未执行。
-- 修复策略：
--   全部不使用 COMMENT，确保 INFORMATION_SCHEMA 幂等判断后 ADD COLUMN 可靠执行。
--   脚本完全幂等，可在本地和云端安全重复运行。

-- ─────────────────────────────────────────────────────────────────────────────
-- Fix 1: t_cutting_task.factory_type
--   (V202607192303 因 COMMENT'' Flyway 截断问题在云端可能未成功添加)
-- ─────────────────────────────────────────────────────────────────────────────
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_cutting_task'
       AND COLUMN_NAME  = 'factory_type') = 0,
    'ALTER TABLE `t_cutting_task` ADD COLUMN `factory_type` VARCHAR(20) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────────────────────
-- Fix 2: t_product_warehousing.repair_status
--   (V202607192200 因 COMMENT'' Flyway 截断问题在云端可能未成功添加)
-- ─────────────────────────────────────────────────────────────────────────────
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_product_warehousing'
       AND COLUMN_NAME  = 'repair_status') = 0,
    'ALTER TABLE `t_product_warehousing` ADD COLUMN `repair_status` VARCHAR(30) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────────────────────
-- Fix 3: t_product_warehousing.repair_operator_name
-- ─────────────────────────────────────────────────────────────────────────────
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_product_warehousing'
       AND COLUMN_NAME  = 'repair_operator_name') = 0,
    'ALTER TABLE `t_product_warehousing` ADD COLUMN `repair_operator_name` VARCHAR(50) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────────────────────
-- Fix 4: t_product_warehousing.repair_completed_time
-- ─────────────────────────────────────────────────────────────────────────────
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_product_warehousing'
       AND COLUMN_NAME  = 'repair_completed_time') = 0,
    'ALTER TABLE `t_product_warehousing` ADD COLUMN `repair_completed_time` DATETIME DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────────────────────
-- Fix 5: t_product_warehousing.unqualified_quantity
--   (V20260424001 的 CREATE TABLE IF NOT EXISTS 含此列，但 ALTER TABLE 段遗漏了它；
--    若表在 V20260424001 执行前已存在，此列从未被添加)
-- ─────────────────────────────────────────────────────────────────────────────
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_product_warehousing'
       AND COLUMN_NAME  = 'unqualified_quantity') = 0,
    'ALTER TABLE `t_product_warehousing` ADD COLUMN `unqualified_quantity` INT NOT NULL DEFAULT 0',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────────────────────
-- 回填：确保 repair_status 逻辑正确
--   (V202607192200 的回填 UPDATE 也可能因 repair_status 添加失败而一并失败)
--   Now both columns are guaranteed to exist, safe to run.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE `t_product_warehousing`
SET    `repair_status` = 'pending_repair'
WHERE  `unqualified_quantity` > 0
  AND  (`repair_status` IS NULL OR `repair_status` = '')
  AND  `delete_flag` = 0;
