-- 给 t_production_order 增加 material_cost 和 total_cost 字段
-- 幂等：用存储过程 + information_schema 判断

DROP PROCEDURE IF EXISTS add_production_order_cost_fields;

DELIMITER $$
CREATE PROCEDURE add_production_order_cost_fields()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 't_production_order'
          AND COLUMN_NAME = 'material_cost'
    ) THEN
        ALTER TABLE t_production_order ADD COLUMN material_cost DECIMAL(12,2) DEFAULT 0.00 COMMENT '面辅料成本汇总（内部工厂采购成本）';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 't_production_order'
          AND COLUMN_NAME = 'total_cost'
    ) THEN
        ALTER TABLE t_production_order ADD COLUMN total_cost DECIMAL(12,2) DEFAULT 0.00 COMMENT '订单总成本 = 加工费 + 面辅料成本';
    END IF;
END$$
DELIMITER ;

CALL add_production_order_cost_fields();
DROP PROCEDURE IF EXISTS add_production_order_cost_fields;
