-- 销售退货单表（幂等创建）
DELIMITER $$
DROP PROCEDURE IF EXISTS create_sales_return_table $$

CREATE PROCEDURE create_sales_return_table()
BEGIN
    DECLARE table_exists INT;
    SELECT COUNT(*) INTO table_exists FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_sales_return';
    IF table_exists = 0 THEN
        CREATE TABLE t_sales_return (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            tenant_id BIGINT NOT NULL COMMENT '租户ID（P0铁律4：多租户隔离）',
            return_no VARCHAR(64) NOT NULL COMMENT '退货单号',
            original_order_id BIGINT NOT NULL COMMENT '原订单ID',
            original_order_no VARCHAR(64) COMMENT '原订单号',
            customer_id VARCHAR(64) COMMENT '客户ID',
            customer_name VARCHAR(128) COMMENT '客户名称',
            return_type VARCHAR(32) DEFAULT 'PARTIAL' COMMENT '退货类型：FULL=全部退货/PARTIAL=部分退货',
            return_reason TEXT COMMENT '退货原因',
            return_status VARCHAR(32) DEFAULT 'PENDING' COMMENT '退货状态：PENDING=待审核/APPROVED=已审核/REFUNDED=已退款/REJECTED=已拒绝',
            total_amount DECIMAL(12,2) DEFAULT 0 COMMENT '退货总金额',
            refund_amount DECIMAL(12,2) DEFAULT 0 COMMENT '实际退款金额',
            operator_id VARCHAR(64) COMMENT '操作人ID',
            operator_name VARCHAR(64) COMMENT '操作人姓名',
            approve_time DATETIME COMMENT '审核时间',
            approve_user_id VARCHAR(64) COMMENT '审核人ID',
            approve_user_name VARCHAR(64) COMMENT '审核人姓名',
            refund_time DATETIME COMMENT '退款时间',
            remark TEXT COMMENT '备注',
            create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            delete_flag TINYINT DEFAULT 0,
            UNIQUE KEY uk_tenant_return_no (tenant_id, return_no),
            KEY idx_original_order (tenant_id, original_order_id),
            KEY idx_customer (tenant_id, customer_id),
            KEY idx_status (tenant_id, return_status),
            KEY idx_create_time (tenant_id, create_time)
        ) COMMENT='销售退货单';
    END IF;
END $$

CALL create_sales_return_table() $$
DROP PROCEDURE IF EXISTS create_sales_return_table $$

-- 退货商品明细表（幂等创建）
DROP PROCEDURE IF EXISTS create_sales_return_item_table $$

CREATE PROCEDURE create_sales_return_item_table()
BEGIN
    DECLARE table_exists INT;
    SELECT COUNT(*) INTO table_exists FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_sales_return_item';
    IF table_exists = 0 THEN
        CREATE TABLE t_sales_return_item (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            tenant_id BIGINT NOT NULL COMMENT '租户ID（P0铁律4：多租户隔离）',
            return_id BIGINT NOT NULL COMMENT '退货单ID',
            style_id VARCHAR(64) COMMENT '款式ID',
            style_no VARCHAR(64) COMMENT '款号',
            style_name VARCHAR(128) COMMENT '款式名称',
            color VARCHAR(32) COMMENT '颜色',
            size VARCHAR(32) COMMENT '尺码',
            quantity INT DEFAULT 0 COMMENT '退货数量',
            unit_price DECIMAL(12,2) DEFAULT 0 COMMENT '单价',
            amount DECIMAL(12,2) DEFAULT 0 COMMENT '金额',
            return_reason VARCHAR(256) COMMENT '退货原因（明细）',
            create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            KEY idx_return (tenant_id, return_id),
            KEY idx_style (tenant_id, style_id)
        ) COMMENT='退货商品明细';
    END IF;
END $$

CALL create_sales_return_item_table() $$
DROP PROCEDURE IF EXISTS create_sales_return_item_table $$

DELIMITER ;
