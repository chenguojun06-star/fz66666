-- 为 t_production_order 和 t_scan_record 添加 ext_json 扩展字段列
-- 用于多租户字段配置系统，存储租户自定义字段的值
-- 幂等：用 INFORMATION_SCHEMA 检查列是否已存在

-- ============================================================
-- 1. t_production_order 加 ext_json
-- ============================================================
DROP PROCEDURE IF EXISTS add_ext_json_to_production_order;
DELIMITER //
CREATE PROCEDURE add_ext_json_to_production_order()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 't_production_order'
          AND COLUMN_NAME = 'ext_json'
    ) THEN
        ALTER TABLE t_production_order
            ADD COLUMN ext_json JSON DEFAULT NULL COMMENT '扩展字段JSON，存储租户自定义字段值';
    END IF;
END //
DELIMITER ;
CALL add_ext_json_to_production_order();
DROP PROCEDURE IF EXISTS add_ext_json_to_production_order;

-- ============================================================
-- 2. t_scan_record 加 ext_json
-- ============================================================
DROP PROCEDURE IF EXISTS add_ext_json_to_scan_record;
DELIMITER //
CREATE PROCEDURE add_ext_json_to_scan_record()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 't_scan_record'
          AND COLUMN_NAME = 'ext_json'
    ) THEN
        ALTER TABLE t_scan_record
            ADD COLUMN ext_json JSON DEFAULT NULL COMMENT '扩展字段JSON，存储租户自定义字段值';
    END IF;
END //
DELIMITER ;
CALL add_ext_json_to_scan_record();
DROP PROCEDURE IF EXISTS add_ext_json_to_scan_record;
