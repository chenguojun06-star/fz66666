-- =====================================================
-- 添加销售渠道和客户信息到款号资料表
-- 执行时间: 2026-06-15
-- 用途: 支持样衣开发时记录销售渠道和客户信息，并在下单、打印等场景中同步显示
-- 注意: MySQL 8.0 不支持 ADD COLUMN IF NOT EXISTS，使用存储过程实现幂等
-- =====================================================

-- 幂等添加列的存储过程
DROP PROCEDURE IF EXISTS _add_style_customer_columns;
DELIMITER //
CREATE PROCEDURE _add_style_customer_columns()
BEGIN
    -- 1. 销售渠道
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='sales_channel') THEN
        ALTER TABLE t_style_info ADD COLUMN sales_channel VARCHAR(100) DEFAULT NULL COMMENT '销售渠道：天猫/抖音/京东/拼多多/线下门店/私域/定制/其他' AFTER development_source_detail;
    END IF;
    -- 2. 客户ID
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='customer_id') THEN
        ALTER TABLE t_style_info ADD COLUMN customer_id BIGINT DEFAULT NULL COMMENT '客户ID，关联客户资料表' AFTER sales_channel;
    END IF;
    -- 3. 客户名称
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='customer_name') THEN
        ALTER TABLE t_style_info ADD COLUMN customer_name VARCHAR(200) DEFAULT NULL COMMENT '客户名称冗余存储' AFTER customer_id;
    END IF;
    -- 4. 客户联系人
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='customer_contact') THEN
        ALTER TABLE t_style_info ADD COLUMN customer_contact VARCHAR(100) DEFAULT NULL COMMENT '客户联系人' AFTER customer_name;
    END IF;
    -- 5. 客户电话
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='customer_phone') THEN
        ALTER TABLE t_style_info ADD COLUMN customer_phone VARCHAR(50) DEFAULT NULL COMMENT '客户联系电话' AFTER customer_contact;
    END IF;
    -- 6. 客户地址
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='customer_address') THEN
        ALTER TABLE t_style_info ADD COLUMN customer_address VARCHAR(500) DEFAULT NULL COMMENT '客户收货地址' AFTER customer_phone;
    END IF;
    -- 索引
    IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND INDEX_NAME='idx_style_sales_channel') THEN
        ALTER TABLE t_style_info ADD INDEX idx_style_sales_channel (sales_channel);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND INDEX_NAME='idx_style_customer_id') THEN
        ALTER TABLE t_style_info ADD INDEX idx_style_customer_id (customer_id);
    END IF;
END //
DELIMITER ;
CALL _add_style_customer_columns();
DROP PROCEDURE IF EXISTS _add_style_customer_columns;
