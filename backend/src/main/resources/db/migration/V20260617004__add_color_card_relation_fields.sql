-- V20260617004__add_color_card_relation_fields.sql
-- 为色卡本系统添加关联字段，实现双向查询
-- 依赖于 V20260617003（先创建表）

-- 1. t_material_database：添加色卡本标识和来源字段
SET @c1 = (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_database' AND COLUMN_NAME='is_color_card');
SET @s1 = IF(@c1=0, 'ALTER TABLE t_material_database ADD COLUMN is_color_card TINYINT(1) DEFAULT 0 COMMENT ''是否色卡本物料（1=是，一条物料=一本色卡）''', 'SELECT 1');
PREPARE stmt1 FROM @s1; EXECUTE stmt1; DEALLOCATE PREPARE stmt1;

SET @c2 = (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_database' AND COLUMN_NAME='source_color_card_id');
SET @s2 = IF(@c2=0, 'ALTER TABLE t_material_database ADD COLUMN source_color_card_id VARCHAR(64) DEFAULT NULL COMMENT ''来源色卡本ID，与 t_color_card.id 关联''', 'SELECT 1');
PREPARE stmt2 FROM @s2; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;

-- 2. t_color_card：保存关联的物料ID，实现双向查询
SET @c3 = (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_color_card' AND COLUMN_NAME='material_id');
SET @s3 = IF(@c3=0, 'ALTER TABLE t_color_card ADD COLUMN material_id VARCHAR(64) DEFAULT NULL COMMENT ''关联的物料ID，与 t_material_database.id 关联''', 'SELECT 1');
PREPARE stmt3 FROM @s3; EXECUTE stmt3; DEALLOCATE PREPARE stmt3;

-- 3. 添加索引
SET @idx1 = (SELECT COUNT(*) FROM information_schema.STATISTICS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_database' AND INDEX_NAME='idx_md_source_cc_id');
SET @si1 = IF(@idx1=0, 'CREATE INDEX idx_md_source_cc_id ON t_material_database(source_color_card_id)', 'SELECT 1');
PREPARE stmtsi1 FROM @si1; EXECUTE stmtsi1; DEALLOCATE PREPARE stmtsi1;

SET @idx2 = (SELECT COUNT(*) FROM information_schema.STATISTICS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_color_card' AND INDEX_NAME='idx_cc_material_id');
SET @si2 = IF(@idx2=0, 'CREATE INDEX idx_cc_material_id ON t_color_card(material_id)', 'SELECT 1');
PREPARE stmtsi2 FROM @si2; EXECUTE stmtsi2; DEALLOCATE PREPARE stmtsi2;
