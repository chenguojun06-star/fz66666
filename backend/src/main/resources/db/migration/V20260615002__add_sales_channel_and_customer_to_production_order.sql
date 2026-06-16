-- =====================================================
-- 添加销售渠道和客户信息到生产订单表
-- 执行时间: 2026-06-15
-- 用途: 订单从样衣开发带入销售渠道和客户详细信息
-- 注意: MySQL 8.0 不支持 ADD COLUMN IF NOT EXISTS，使用存储过程实现幂等
-- =====================================================

DROP PROCEDURE IF EXISTS _add_order_customer_columns;
DELIMITER //
CREATE PROCEDURE _add_order_customer_columns()
BEGIN
    -- 1. 销售渠道
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='sales_channel') THEN
        ALTER TABLE t_production_order ADD COLUMN sales_channel VARCHAR(100) DEFAULT NULL COMMENT '销售渠道：天猫/抖音/京东/拼多多/线下门店/私域/定制/其他' AFTER customer_name;
    END IF;
    -- 2. 客户联系人
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='customer_contact') THEN
        ALTER TABLE t_production_order ADD COLUMN customer_contact VARCHAR(100) DEFAULT NULL COMMENT '客户联系人' AFTER sales_channel;
    END IF;
    -- 3. 客户电话
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='customer_phone') THEN
        ALTER TABLE t_production_order ADD COLUMN customer_phone VARCHAR(50) DEFAULT NULL COMMENT '客户联系电话' AFTER customer_contact;
    END IF;
    -- 4. 客户地址
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='customer_address') THEN
        ALTER TABLE t_production_order ADD COLUMN customer_address VARCHAR(500) DEFAULT NULL COMMENT '客户收货地址' AFTER customer_phone;
    END IF;
END //
DELIMITER ;
CALL _add_order_customer_columns();
DROP PROCEDURE IF EXISTS _add_order_customer_columns;
