-- 电商退货全链路：为销售退货表增加电商订单关联字段
-- 关联 t_ecommerce_order.id，支持从电商订单发起退货
-- 幂等实现：使用 information_schema 检查列是否存在

DELIMITER $$

-- 1. t_sales_return 加 ecommerce_order_id 字段
DROP PROCEDURE IF EXISTS proc_add_ecommerce_order_id_to_sales_return$$
CREATE PROCEDURE proc_add_ecommerce_order_id_to_sales_return()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 't_sales_return'
          AND COLUMN_NAME = 'ecommerce_order_id'
    ) THEN
        ALTER TABLE t_sales_return
            ADD COLUMN ecommerce_order_id BIGINT NULL COMMENT '关联电商订单ID（t_ecommerce_order.id），为空表示非电商退货' AFTER original_order_no;
    END IF;
END$$

-- 2. 加索引（按电商订单查询退货单）
DROP PROCEDURE IF EXISTS proc_add_idx_ecommerce_order_id$$
CREATE PROCEDURE proc_add_idx_ecommerce_order_id()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 't_sales_return'
          AND INDEX_NAME = 'idx_ecommerce_order_id'
    ) THEN
        ALTER TABLE t_sales_return ADD INDEX idx_ecommerce_order_id (tenant_id, ecommerce_order_id);
    END IF;
END$$

DELIMITER ;

CALL proc_add_ecommerce_order_id_to_sales_return();
CALL proc_add_idx_ecommerce_order_id();

DROP PROCEDURE IF EXISTS proc_add_ecommerce_order_id_to_sales_return;
DROP PROCEDURE IF EXISTS proc_add_idx_ecommerce_order_id;
