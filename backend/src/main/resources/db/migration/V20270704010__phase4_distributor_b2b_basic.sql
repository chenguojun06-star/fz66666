-- ============================================================
-- Phase 4：分销/B2B 基础版
-- 1. 新建 3 张表：t_distributor_profile / t_distributor_level / t_distributor_price_policy
-- 2. 现有 4 张表加字段（带默认值，零改造现有 SQL）：
--    t_customer            加 customer_type
--    t_ecommerce_order     加 order_type + distributor_id
--    t_ec_sales_revenue    加 revenue_source
--    t_ec_platform_bill    加 bill_source + distributor_id（复用对账表）
-- 幂等：INFORMATION_SCHEMA + DROP/CREATE PROCEDURE
-- ============================================================

-- ====== 1. 新建 t_distributor_level（分销商等级） ======
DROP PROCEDURE IF EXISTS proc_create_distributor_level;
DELIMITER //
CREATE PROCEDURE proc_create_distributor_level()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES
                   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_distributor_level') THEN
        CREATE TABLE t_distributor_level (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            tenant_id BIGINT NOT NULL COMMENT '租户ID（P0铁律4）',
            level_code VARCHAR(32) NOT NULL COMMENT '等级编码（如 VIP/A/B/C）',
            level_name VARCHAR(64) NOT NULL COMMENT '等级名称',
            default_discount DECIMAL(5,2) DEFAULT 100.00 COMMENT '默认折扣率（0-100）',
            min_purchase_amount DECIMAL(18,2) DEFAULT 0.00 COMMENT '升级门槛（累计采购额）',
            sort_order INT DEFAULT 0 COMMENT '排序',
            enabled TINYINT DEFAULT 1 COMMENT '是否启用',
            delete_flag TINYINT DEFAULT 0,
            create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uk_tenant_level_code (tenant_id, level_code),
            KEY idx_tenant_enabled (tenant_id, enabled, sort_order)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='分销商等级';
    END IF;
END //
DELIMITER ;
CALL proc_create_distributor_level();
DROP PROCEDURE IF EXISTS proc_create_distributor_level;

-- ====== 2. 新建 t_distributor_profile（分销商档案） ======
DROP PROCEDURE IF EXISTS proc_create_distributor_profile;
DELIMITER //
CREATE PROCEDURE proc_create_distributor_profile()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES
                   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_distributor_profile') THEN
        CREATE TABLE t_distributor_profile (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            tenant_id BIGINT NOT NULL COMMENT '租户ID（P0铁律4）',
            customer_id VARCHAR(64) COMMENT '关联 t_customer.id（复用客户档案）',
            distributor_no VARCHAR(64) NOT NULL COMMENT '分销商编号',
            distributor_name VARCHAR(128) NOT NULL COMMENT '分销商名称',
            distributor_level VARCHAR(32) COMMENT '等级编码（关联 t_distributor_level.level_code）',
            contact_person VARCHAR(64) COMMENT '联系人',
            contact_phone VARCHAR(32) COMMENT '联系电话',
            address VARCHAR(256) COMMENT '地址',
            settlement_cycle VARCHAR(16) DEFAULT 'CASH' COMMENT '结算周期：CASH/MONTHLY/QUARTERLY',
            credit_limit DECIMAL(18,2) DEFAULT 0.00 COMMENT '信用额度',
            used_credit DECIMAL(18,2) DEFAULT 0.00 COMMENT '已用额度',
            status VARCHAR(16) DEFAULT 'ACTIVE' COMMENT 'ACTIVE/INACTIVE/FROZEN',
            remark VARCHAR(512),
            delete_flag TINYINT DEFAULT 0,
            create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            creator_id VARCHAR(64),
            creator_name VARCHAR(64),
            UNIQUE KEY uk_tenant_distributor_no (tenant_id, distributor_no),
            KEY idx_customer (tenant_id, customer_id),
            KEY idx_level (tenant_id, distributor_level),
            KEY idx_status (tenant_id, status, delete_flag)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='分销商档案';
    END IF;
END //
DELIMITER ;
CALL proc_create_distributor_profile();
DROP PROCEDURE IF EXISTS proc_create_distributor_profile;

-- ====== 3. 新建 t_distributor_price_policy（分销商价格政策） ======
DROP PROCEDURE IF EXISTS proc_create_distributor_price_policy;
DELIMITER //
CREATE PROCEDURE proc_create_distributor_price_policy()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES
                   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_distributor_price_policy') THEN
        CREATE TABLE t_distributor_price_policy (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            tenant_id BIGINT NOT NULL COMMENT '租户ID（P0铁律4）',
            policy_name VARCHAR(128) NOT NULL COMMENT '策略名称',
            policy_type VARCHAR(16) NOT NULL COMMENT 'FIXED/DISCOUNT/TIERED',
            distributor_level VARCHAR(32) COMMENT '适用等级（NULL=全部）',
            sku_code VARCHAR(64) COMMENT '适用SKU（NULL=全部）',
            supply_price DECIMAL(18,2) COMMENT '供货价',
            min_retail_price DECIMAL(18,2) COMMENT '最低零售价（限价）',
            tier_json TEXT COMMENT '阶梯价JSON：[{minQty,maxQty,price}]',
            effective_from DATETIME COMMENT '生效开始',
            effective_to DATETIME COMMENT '生效结束',
            enabled TINYINT DEFAULT 1,
            delete_flag TINYINT DEFAULT 0,
            create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uk_tenant_sku_level (tenant_id, sku_code, distributor_level),
            KEY idx_level (tenant_id, distributor_level),
            KEY idx_enabled (tenant_id, enabled, delete_flag)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='分销商价格政策';
    END IF;
END //
DELIMITER ;
CALL proc_create_distributor_price_policy();
DROP PROCEDURE IF EXISTS proc_create_distributor_price_policy;

-- ====== 4. t_customer 加 customer_type 字段 ======
DROP PROCEDURE IF EXISTS proc_add_customer_type_to_customer;
DELIMITER //
CREATE PROCEDURE proc_add_customer_type_to_customer()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                   WHERE TABLE_SCHEMA = DATABASE()
                     AND TABLE_NAME = 't_customer'
                     AND COLUMN_NAME = 'customer_type') THEN
        ALTER TABLE t_customer
            ADD COLUMN customer_type VARCHAR(16) DEFAULT 'NORMAL' COMMENT '客户类型：NORMAL/DISTRIBUTOR' AFTER customer_level;
    END IF;
END //
DELIMITER ;
CALL proc_add_customer_type_to_customer();
DROP PROCEDURE IF EXISTS proc_add_customer_type_to_customer;

-- ====== 5. t_ecommerce_order 加 order_type + distributor_id ======
DROP PROCEDURE IF EXISTS proc_add_order_type_to_ecommerce_order;
DELIMITER //
CREATE PROCEDURE proc_add_order_type_to_ecommerce_order()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                   WHERE TABLE_SCHEMA = DATABASE()
                     AND TABLE_NAME = 't_ecommerce_order'
                     AND COLUMN_NAME = 'order_type') THEN
        ALTER TABLE t_ecommerce_order
            ADD COLUMN order_type VARCHAR(16) DEFAULT 'EC' COMMENT '订单类型：EC/B2B' AFTER is_presale,
            ADD COLUMN distributor_id BIGINT NULL COMMENT '分销商ID（B2B订单必填）' AFTER order_type;
    END IF;
END //
DELIMITER ;
CALL proc_add_order_type_to_ecommerce_order();
DROP PROCEDURE IF EXISTS proc_add_order_type_to_ecommerce_order;

-- ====== 6. t_ec_sales_revenue 加 revenue_source ======
DROP PROCEDURE IF EXISTS proc_add_revenue_source_to_sales_revenue;
DELIMITER //
CREATE PROCEDURE proc_add_revenue_source_to_sales_revenue()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                   WHERE TABLE_SCHEMA = DATABASE()
                     AND TABLE_NAME = 't_ec_sales_revenue'
                     AND COLUMN_NAME = 'revenue_source') THEN
        ALTER TABLE t_ec_sales_revenue
            ADD COLUMN revenue_source VARCHAR(16) DEFAULT 'EC' COMMENT '收入来源：EC/DISTRIBUTOR' AFTER status;
    END IF;
END //
DELIMITER ;
CALL proc_add_revenue_source_to_sales_revenue();
DROP PROCEDURE IF EXISTS proc_add_revenue_source_to_sales_revenue;

-- ====== 7. t_ec_platform_bill 加 bill_source + distributor_id（复用对账表） ======
DROP PROCEDURE IF EXISTS proc_add_bill_source_to_platform_bill;
DELIMITER //
CREATE PROCEDURE proc_add_bill_source_to_platform_bill()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                   WHERE TABLE_SCHEMA = DATABASE()
                     AND TABLE_NAME = 't_ec_platform_bill'
                     AND COLUMN_NAME = 'bill_source') THEN
        ALTER TABLE t_ec_platform_bill
            ADD COLUMN bill_source VARCHAR(16) DEFAULT 'PLATFORM' COMMENT '账单来源：PLATFORM/DISTRIBUTOR' AFTER bill_period,
            ADD COLUMN distributor_id BIGINT NULL COMMENT '分销商ID（bill_source=DISTRIBUTOR时必填）' AFTER bill_source;
    END IF;
END //
DELIMITER ;
CALL proc_add_bill_source_to_platform_bill();
DROP PROCEDURE IF EXISTS proc_add_bill_source_to_platform_bill;
