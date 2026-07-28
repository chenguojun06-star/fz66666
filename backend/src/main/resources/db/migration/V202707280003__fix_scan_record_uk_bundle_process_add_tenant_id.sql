-- 修复 t_scan_record 唯一键 uk_bundle_process：加入 tenant_id
-- 关联铁律：P0 #4 多租户隔离
--
-- 问题：原唯一键 (cutting_bundle_id, scan_type, process_code) 缺少 tenant_id
--       多租户环境下，不同租户的 cutting_bundle_id 可能重复（若使用了非全局唯一ID）
--       导致跨租户扫码冲突
--
-- 修复：重建为 (cutting_bundle_id, scan_type, process_code, tenant_id)
-- 幂等写法：INFORMATION_SCHEMA 判断索引是否存在，避免 DROP/ADD 报错

-- 1. 删除旧唯一键 uk_bundle_process（不含 tenant_id）
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_scan_record'
       AND INDEX_NAME = 'uk_bundle_process') > 0,
    'ALTER TABLE t_scan_record DROP INDEX uk_bundle_process',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. 新建唯一键：含 tenant_id（如不存在则添加）
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_scan_record'
       AND INDEX_NAME = 'uk_bundle_process') = 0,
    'ALTER TABLE t_scan_record ADD UNIQUE KEY uk_bundle_process (cutting_bundle_id, scan_type, process_code, tenant_id)',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
