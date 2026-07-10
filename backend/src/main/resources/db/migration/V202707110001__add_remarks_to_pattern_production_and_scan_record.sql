-- 样衣生产表加 remarks 字段（操作日志自动追加）
-- 样衣扫码记录表加 unit_price / scan_cost 字段（支持按样衣单价结算工资）
-- 关联铁律：P0 #1 Flyway 强制（幂等 + information_schema）

-- 1. t_pattern_production 加 remarks
DROP PROCEDURE IF EXISTS p_add_remarks_to_pattern_production;
DELIMITER $$
CREATE PROCEDURE p_add_remarks_to_pattern_production()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                   WHERE TABLE_SCHEMA = DATABASE()
                     AND TABLE_NAME = 't_pattern_production'
                     AND COLUMN_NAME = 'remarks') THEN
        ALTER TABLE t_pattern_production ADD COLUMN remarks TEXT COMMENT '备注/操作日志（自动追加）' AFTER rework_remark;
    END IF;
END$$
DELIMITER ;
CALL p_add_remarks_to_pattern_production();
DROP PROCEDURE IF EXISTS p_add_remarks_to_pattern_production;

-- 2. t_pattern_scan_record 加 unit_price
DROP PROCEDURE IF EXISTS p_add_unit_price_to_pattern_scan_record;
DELIMITER $$
CREATE PROCEDURE p_add_unit_price_to_pattern_scan_record()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                   WHERE TABLE_SCHEMA = DATABASE()
                     AND TABLE_NAME = 't_pattern_scan_record'
                     AND COLUMN_NAME = 'unit_price') THEN
        ALTER TABLE t_pattern_scan_record ADD COLUMN unit_price DECIMAL(10,2) DEFAULT NULL COMMENT '工序单价' AFTER quantity;
    END IF;
END$$
DELIMITER ;
CALL p_add_unit_price_to_pattern_scan_record();
DROP PROCEDURE IF EXISTS p_add_unit_price_to_pattern_scan_record;

-- 3. t_pattern_scan_record 加 scan_cost
DROP PROCEDURE IF EXISTS p_add_scan_cost_to_pattern_scan_record;
DELIMITER $$
CREATE PROCEDURE p_add_scan_cost_to_pattern_scan_record()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                   WHERE TABLE_SCHEMA = DATABASE()
                     AND TABLE_NAME = 't_pattern_scan_record'
                     AND COLUMN_NAME = 'scan_cost') THEN
        ALTER TABLE t_pattern_scan_record ADD COLUMN scan_cost DECIMAL(12,2) DEFAULT NULL COMMENT '扫码成本=单价×数量' AFTER unit_price;
    END IF;
END$$
DELIMITER ;
CALL p_add_scan_cost_to_pattern_scan_record();
DROP PROCEDURE IF EXISTS p_add_scan_cost_to_pattern_scan_record;
