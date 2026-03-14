-- Idempotent migration: errors from pre-existing structures are silently ignored
-- Wrapped in stored procedure with CONTINUE HANDLER to skip duplicate column/table/index errors
DROP PROCEDURE IF EXISTS `__mig_V34__add_ecommerce_unit_price`;
DELIMITER $$
CREATE PROCEDURE `__mig_V34__add_ecommerce_unit_price`()
BEGIN
    DECLARE CONTINUE HANDLER FOR SQLEXCEPTION BEGIN END;
    -- 补充电商订单单价字段（件单价，区别于 total_amount 总金额）
    -- 本地 Flyway 自动执行；云端需手动在控制台执行
    -- MySQL 5.7 不支持 ADD COLUMN，直接 ADD COLUMN（首次执行安全）
    ALTER TABLE t_ecommerce_order
        ADD COLUMN unit_price DECIMAL(10,2) DEFAULT NULL COMMENT '商品单价（元/件）';

END$$
DELIMITER ;
CALL `__mig_V34__add_ecommerce_unit_price`();
DROP PROCEDURE IF EXISTS `__mig_V34__add_ecommerce_unit_price`;
