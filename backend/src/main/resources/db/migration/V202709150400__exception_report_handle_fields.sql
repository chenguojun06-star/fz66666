-- V202709150400 — 异常报告补齐「处理」字段（D-416）
--
-- 背景：t_production_exception_report 建表时就定义了 status 注释
--       「PENDING=待处理, RESOLVED=已解决」，但后端只有 POST /report（上报）一个接口，
--       没有任何地方把 status 从 PENDING 改成 RESOLVED —— 异常报了就永远挂着，手机端也无法处理。
--
-- 本次补齐：处理人 / 处理说明 / 处理时间，使「谁、何时、为什么这样处理」可审计。
-- 幂等：逐列判断 INFORMATION_SCHEMA，已存在则跳过（可安全重复执行）。
--
-- 注意：沿用项目既有写法（禁止修改已执行脚本，只新增）。

-- 1) handler_id：处理人 ID
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 't_production_exception_report'
      AND COLUMN_NAME  = 'handler_id') = 0,
    'ALTER TABLE `t_production_exception_report` ADD COLUMN `handler_id` VARCHAR(64) DEFAULT NULL COMMENT ''处理人ID'' AFTER `status`',
    'SELECT ''t_production_exception_report.handler_id already exists, skip'' AS msg');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2) handler_name：处理人姓名
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 't_production_exception_report'
      AND COLUMN_NAME  = 'handler_name') = 0,
    'ALTER TABLE `t_production_exception_report` ADD COLUMN `handler_name` VARCHAR(64) DEFAULT NULL COMMENT ''处理人姓名'' AFTER `handler_id`',
    'SELECT ''t_production_exception_report.handler_name already exists, skip'' AS msg');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3) handle_note：处理说明
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 't_production_exception_report'
      AND COLUMN_NAME  = 'handle_note') = 0,
    'ALTER TABLE `t_production_exception_report` ADD COLUMN `handle_note` VARCHAR(500) DEFAULT NULL COMMENT ''处理说明'' AFTER `handler_name`',
    'SELECT ''t_production_exception_report.handle_note already exists, skip'' AS msg');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4) handle_time：处理时间
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 't_production_exception_report'
      AND COLUMN_NAME  = 'handle_time') = 0,
    'ALTER TABLE `t_production_exception_report` ADD COLUMN `handle_time` DATETIME DEFAULT NULL COMMENT ''处理时间'' AFTER `handle_note`',
    'SELECT ''t_production_exception_report.handle_time already exists, skip'' AS msg');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 5) 处理状态检索索引（异常列表常按 status 过滤未处理项）
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 't_production_exception_report'
      AND INDEX_NAME   = 'idx_exception_status') = 0,
    'ALTER TABLE `t_production_exception_report` ADD INDEX `idx_exception_status` (`tenant_id`, `status`, `create_time`)',
    'SELECT ''idx_exception_status already exists, skip'' AS msg');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
