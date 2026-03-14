-- Idempotent migration: errors from pre-existing structures are silently ignored
-- Wrapped in stored procedure with CONTINUE HANDLER to skip duplicate column/table/index errors
DROP PROCEDURE IF EXISTS `__mig_V33__add_ecommerce_order_fields`;
DELIMITER $$
CREATE PROCEDURE `__mig_V33__add_ecommerce_order_fields`()
BEGIN
    DECLARE CONTINUE HANDLER FOR SQLEXCEPTION BEGIN END;
    -- 为电商订单表补充关联字段（本地 Flyway 自动执行；云端需手动执行）
    ALTER TABLE t_ecommerce_order
        ADD COLUMN tenant_id BIGINT COMMENT '租户ID',
        ADD COLUMN production_order_id VARCHAR(64) COMMENT '关联生产订单ID',
        ADD COLUMN production_order_no VARCHAR(100) COMMENT '关联生产订单号',
        ADD COLUMN source_platform_code VARCHAR(20) COMMENT '来源平台代码(与AppStore code一致)',
        ADD COLUMN sku_code VARCHAR(100) COMMENT '下单SKU编码',
        ADD COLUMN product_name VARCHAR(200) COMMENT '商品名称',
        ADD COLUMN quantity INT DEFAULT 1 COMMENT '购买件数',
        ADD COLUMN warehouse_status TINYINT DEFAULT 0 COMMENT '仓库状态: 0-待拣货, 1-备货中, 2-已出库';

    -- 索引
    ALTER TABLE t_ecommerce_order
        ADD INDEX idx_tenant_id (tenant_id),
        ADD INDEX idx_production_order_id (production_order_id),
        ADD INDEX idx_source_platform (source_platform_code);

END$$
DELIMITER ;
CALL `__mig_V33__add_ecommerce_order_fields`();
DROP PROCEDURE IF EXISTS `__mig_V33__add_ecommerce_order_fields`;
