-- 修复 t_scan_record 唯一键 uk_bundle_process：加入 tenant_id
-- 关联铁律：P0 #4 多租户隔离
--
-- 问题：原唯一键 (cutting_bundle_id, scan_type, process_code) 缺少 tenant_id
--       多租户环境下，不同租户的 cutting_bundle_id 可能重复（若使用了非全局唯一ID）
--       导致跨租户扫码冲突
--
-- 修复：重建为 (cutting_bundle_id, scan_type, process_code, tenant_id)
-- 幂等写法：INFORMATION_SCHEMA 判断索引是否存在，避免 DROP/ADD 报错
--
-- 注意：cutting_bundle_id 上有外键 fk_scan_record_bundle（→ t_cutting_bundle），
--       MySQL 要求 FK 列必须有可用索引；uk_bundle_process 首列即 cutting_bundle_id，
--       直接 DROP INDEX 会报 1553（needed in a foreign key constraint）。
--       因此必须先删外键 → 重建索引 → 恢复外键（新索引首列仍满足 FK 要求）。

-- 0. 先删外键 fk_scan_record_bundle（如存在）
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_scan_record'
       AND CONSTRAINT_NAME = 'fk_scan_record_bundle'
       AND CONSTRAINT_TYPE = 'FOREIGN KEY') > 0,
    'ALTER TABLE t_scan_record DROP FOREIGN KEY fk_scan_record_bundle',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

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

-- 3. 恢复外键 fk_scan_record_bundle（新唯一键首列 cutting_bundle_id 满足 FK 索引要求）
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_scan_record'
       AND CONSTRAINT_NAME = 'fk_scan_record_bundle'
       AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0,
    'ALTER TABLE t_scan_record ADD CONSTRAINT fk_scan_record_bundle FOREIGN KEY (cutting_bundle_id) REFERENCES t_cutting_bundle (id)',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
