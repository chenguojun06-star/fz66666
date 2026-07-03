-- 给 t_production_order 和 t_product_outstock 增加 platform_code 字段
-- 用于打通电商平台来源，生产订单和出库记录可直接按平台筛选/统计
-- 幂等：用存储过程 + information_schema 判断

DROP PROCEDURE IF EXISTS add_platform_code_fields;

DELIMITER $$
CREATE PROCEDURE add_platform_code_fields()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 't_production_order'
          AND COLUMN_NAME = 'platform_code'
    ) THEN
        ALTER TABLE t_production_order ADD COLUMN platform_code VARCHAR(32) DEFAULT NULL COMMENT '电商平台代码（TB/JD/PDD/DY/XHS/WC/SFY/SY/JST），从EC订单同步';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 't_product_outstock'
          AND COLUMN_NAME = 'platform_code'
    ) THEN
        ALTER TABLE t_product_outstock ADD COLUMN platform_code VARCHAR(32) DEFAULT NULL COMMENT '电商平台代码（从生产订单或EC订单带入）';
    END IF;
END$$
DELIMITER ;

CALL add_platform_code_fields();
DROP PROCEDURE IF EXISTS add_platform_code_fields;
