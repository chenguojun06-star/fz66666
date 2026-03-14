-- V47: 补齐 t_material_database 云端缺失列
-- 问题: completed_time / return_reason / supplier_id / supplier_contact_* 在云端从未添加
-- 导致: PUT /api/material/database/{id}/return -> BadSqlGrammarException -> 500
-- 修复: 双重守卫 = 表必须存在 AND 列不存在，才执行 ALTER TABLE（安全重复执行）
-- 注: 用 INFORMATION_SCHEMA.STATISTICS 守卫替代不可靠的 CREATE INDEX IF NOT EXISTS

SET @tbl = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_database');

SET @s = IF(@tbl > 0 AND (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_database' AND COLUMN_NAME='completed_time')=0,'ALTER TABLE t_material_database ADD COLUMN completed_time DATETIME DEFAULT NULL COMMENT ''完成时间''','SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(@tbl > 0 AND (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_database' AND COLUMN_NAME='return_reason')=0,'ALTER TABLE t_material_database ADD COLUMN return_reason VARCHAR(255) DEFAULT NULL COMMENT ''退回原因''','SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(@tbl > 0 AND (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_database' AND COLUMN_NAME='supplier_id')=0,'ALTER TABLE t_material_database ADD COLUMN supplier_id VARCHAR(50) DEFAULT NULL COMMENT ''供应商ID''','SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(@tbl > 0 AND (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_database' AND COLUMN_NAME='supplier_contact_person')=0,'ALTER TABLE t_material_database ADD COLUMN supplier_contact_person VARCHAR(50) DEFAULT NULL COMMENT ''供应商联系人''','SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(@tbl > 0 AND (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_database' AND COLUMN_NAME='supplier_contact_phone')=0,'ALTER TABLE t_material_database ADD COLUMN supplier_contact_phone VARCHAR(20) DEFAULT NULL COMMENT ''供应商联系电话''','SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @i = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_database' AND INDEX_NAME='idx_md_supplier_id');
SET @s = IF(@tbl > 0 AND @i = 0, 'CREATE INDEX idx_md_supplier_id ON t_material_database (supplier_id)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
