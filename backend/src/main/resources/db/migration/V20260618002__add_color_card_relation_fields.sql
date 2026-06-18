-- ============================================================
-- V20260618002__add_color_card_relation_fields.sql
-- 色卡本母子关系改造：一本色卡 = 一条物料，颜色保留为子属性
-- 1. t_material_database：标识是否色卡本物料 + 关联色卡本ID
-- 2. t_color_card：保存关联的物料ID，实现双向查询
-- ============================================================

DROP PROCEDURE IF EXISTS _add_cc_fields;

DELIMITER //

CREATE PROCEDURE _add_cc_fields()
BEGIN
    -- t_material_database：标识色卡本物料
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_database' AND COLUMN_NAME='is_color_card') THEN
        ALTER TABLE t_material_database ADD COLUMN is_color_card TINYINT(1) DEFAULT 0 COMMENT '是否色卡本物料（1=是，一条物料=一本色卡）';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_database' AND COLUMN_NAME='source_color_card_id') THEN
        ALTER TABLE t_material_database ADD COLUMN source_color_card_id VARCHAR(64) DEFAULT NULL COMMENT '来源色卡本ID，与 t_color_card.id 关联';
    END IF;

    -- t_color_card：保存关联的物料ID，实现双向查询
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_color_card' AND COLUMN_NAME='material_id') THEN
        ALTER TABLE t_color_card ADD COLUMN material_id VARCHAR(64) DEFAULT NULL COMMENT '关联的物料ID，与 t_material_database.id 关联';
    END IF;

    -- 创建索引便于按色卡本ID反查物料
    SET @sql1 = IF(NOT EXISTS(SELECT 1 FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_database' AND INDEX_NAME='idx_md_source_cc_id'),
        'CREATE INDEX idx_md_source_cc_id ON t_material_database(source_color_card_id)',
        'SELECT 1');
    PREPARE stmt1 FROM @sql1;
    EXECUTE stmt1;
    DEALLOCATE PREPARE stmt1;

    -- 创建索引便于按物料ID反查色卡本
    SET @sql2 = IF(NOT EXISTS(SELECT 1 FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_color_card' AND INDEX_NAME='idx_cc_material_id'),
        'CREATE INDEX idx_cc_material_id ON t_color_card(material_id)',
        'SELECT 1');
    PREPARE stmt2 FROM @sql2;
    EXECUTE stmt2;
    DEALLOCATE PREPARE stmt2;
END //

DELIMITER ;

CALL _add_cc_fields();
DROP PROCEDURE IF EXISTS _add_cc_fields;
