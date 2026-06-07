-- ========================================================================
-- 修复扫码记录唯一键：加入 process_code（子工序名）
--
-- 原来唯一键：(cutting_bundle_id, scan_type, progress_stage)
-- 问题：动态映射后，剪线/质检/整烫 都映射到父节点'尾部'，
--       同一菲号多个子工序扫码会因 progress_stage 都是'尾部'而冲突
-- 修复：唯一键改为 (cutting_bundle_id, scan_type, process_code)
--       这样同一菲号的不同子工序可以各自独立记录
-- 幂等写法：INFORMATION_SCHEMA 判断索引是否存在，避免 DROP/ADD 报错
-- ========================================================================

-- 删除旧唯一键 uk_bundle_stage（如存在）
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_scan_record'
       AND INDEX_NAME = 'uk_bundle_stage') > 0,
    'ALTER TABLE t_scan_record DROP INDEX uk_bundle_stage',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 删除旧唯一键 uk_bundle_stage_progress（如存在）
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_scan_record'
       AND INDEX_NAME = 'uk_bundle_stage_progress') > 0,
    'ALTER TABLE t_scan_record DROP INDEX uk_bundle_stage_progress',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 新建唯一键：按子工序名去重（如不存在则添加）
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_scan_record'
       AND INDEX_NAME = 'uk_bundle_process') = 0,
    'ALTER TABLE t_scan_record ADD UNIQUE KEY uk_bundle_process (cutting_bundle_id, scan_type, process_code)',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
