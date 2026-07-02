DROP PROCEDURE IF EXISTS `__mig_repair_old_compatibility`;
DELIMITER $$
CREATE PROCEDURE `__mig_repair_old_compatibility`()
BEGIN
    DECLARE CONTINUE HANDLER FOR SQLEXCEPTION BEGIN END;

    SET @db_name = DATABASE();

    -- 1. 修复 V37__ensure_scan_record_time_columns.sql 遗留问题
    -- V37 使用了 PREPARE + DEFAULT NULL，MySQL 8.0 不支持
    -- 确保 receive_time 和 confirm_time 列存在（幂等检查）
    SELECT COUNT(*) INTO @col_exists
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 't_scan_record' AND COLUMN_NAME = 'receive_time';
    IF @col_exists = 0 THEN
        ALTER TABLE t_scan_record ADD COLUMN receive_time DATETIME NULL COMMENT '领取/开始时间';
    END IF;

    SELECT COUNT(*) INTO @col_exists
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 't_scan_record' AND COLUMN_NAME = 'confirm_time';
    IF @col_exists = 0 THEN
        ALTER TABLE t_scan_record ADD COLUMN confirm_time DATETIME NULL COMMENT '录入结果/完成时间';
    END IF;

    -- 2. 修复 V34.02__add_production_process_tracking_table.sql 遗留问题
    -- V34.02 使用了 CREATE TABLE IF NOT EXISTS，MySQL 8.0 不支持
    -- 确保表存在（幂等检查）
    SELECT COUNT(*) INTO @table_exists
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 't_production_process_tracking';
    IF @table_exists = 0 THEN
        CREATE TABLE t_production_process_tracking (
            id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
            production_order_id BIGINT NOT NULL COMMENT '生产订单ID',
            production_order_no VARCHAR(50) NOT NULL COMMENT '订单号',
            cutting_bundle_id BIGINT NOT NULL COMMENT '菲号ID（裁剪单ID）',
            bundle_no VARCHAR(50) COMMENT '菲号编号',
            sku VARCHAR(50) COMMENT 'SKU号',
            color VARCHAR(50) COMMENT '颜色',
            size VARCHAR(20) COMMENT '尺码',
            quantity INT COMMENT '数量',
            process_code VARCHAR(50) NOT NULL COMMENT '工序编号',
            process_name VARCHAR(50) NOT NULL COMMENT '工序名称',
            process_order INT COMMENT '工序顺序',
            unit_price DECIMAL(10,2) COMMENT '单价（元/件）',
            scan_status VARCHAR(20) DEFAULT 'pending' COMMENT '状态',
            scan_time DATETIME COMMENT '扫码时间',
            scan_record_id BIGINT COMMENT '关联扫码记录ID',
            operator_id BIGINT COMMENT '操作人ID',
            operator_name VARCHAR(50) COMMENT '操作人姓名',
            factory_id BIGINT COMMENT '执行工厂ID',
            factory_name VARCHAR(100) COMMENT '执行工厂名称',
            settlement_amount DECIMAL(10,2) COMMENT '结算金额',
            is_settled TINYINT(1) DEFAULT 0 COMMENT '是否已结算',
            settlement_time DATETIME COMMENT '结算时间',
            tenant_id BIGINT COMMENT '租户ID',
            create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
            update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
            creator VARCHAR(50) COMMENT '创建人',
            updater VARCHAR(50) COMMENT '更新人',
            delete_flag TINYINT(1) DEFAULT 0 COMMENT '删除标志',
            INDEX idx_order (production_order_id),
            INDEX idx_bundle (cutting_bundle_id),
            INDEX idx_process (process_code),
            INDEX idx_status (scan_status),
            INDEX idx_operator (operator_id),
            INDEX idx_tenant (tenant_id),
            UNIQUE KEY uk_bundle_process (cutting_bundle_id, process_code) COMMENT '菲号+工序唯一'
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='生产工序跟踪表';
    END IF;

    -- 3. 确保 t_production_process_tracking 有 tenant_id 和 delete_flag 字段（幂等检查）
    SELECT COUNT(*) INTO @col_exists
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 't_production_process_tracking' AND COLUMN_NAME = 'tenant_id';
    IF @col_exists = 0 THEN
        ALTER TABLE t_production_process_tracking ADD COLUMN tenant_id BIGINT COMMENT '租户ID';
    END IF;

    SELECT COUNT(*) INTO @col_exists
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 't_production_process_tracking' AND COLUMN_NAME = 'delete_flag';
    IF @col_exists = 0 THEN
        ALTER TABLE t_production_process_tracking ADD COLUMN delete_flag TINYINT(1) DEFAULT 0 COMMENT '删除标志';
    END IF;

END$$
DELIMITER ;
CALL `__mig_repair_old_compatibility`();
DROP PROCEDURE IF EXISTS `__mig_repair_old_compatibility`;