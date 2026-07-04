-- ============================================================
-- V20270704002 - 给 t_customer 和 t_factory 加 ext_json 列
-- 用途：承载自定义字段值（多租户字段配置系统 - 阶段3）
-- 原则：幂等，用 INFORMATION_SCHEMA 检查，存储过程方式（P0铁律1：禁止动态SQL字符串字面量）
-- ============================================================

-- 1. t_customer 加 ext_json
DROP PROCEDURE IF EXISTS add_ext_json_to_customer;
DELIMITER //
CREATE PROCEDURE add_ext_json_to_customer()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 't_customer'
          AND COLUMN_NAME = 'ext_json'
    ) THEN
        ALTER TABLE t_customer
            ADD COLUMN ext_json JSON DEFAULT NULL COMMENT '扩展字段JSON，承载自定义字段值';
    END IF;
END //
DELIMITER ;
CALL add_ext_json_to_customer();
DROP PROCEDURE IF EXISTS add_ext_json_to_customer;

-- 2. t_factory 加 ext_json
DROP PROCEDURE IF EXISTS add_ext_json_to_factory;
DELIMITER //
CREATE PROCEDURE add_ext_json_to_factory()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 't_factory'
          AND COLUMN_NAME = 'ext_json'
    ) THEN
        ALTER TABLE t_factory
            ADD COLUMN ext_json JSON DEFAULT NULL COMMENT '扩展字段JSON，承载自定义字段值';
    END IF;
END //
DELIMITER ;
CALL add_ext_json_to_factory();
DROP PROCEDURE IF EXISTS add_ext_json_to_factory;
