-- ============================================================
-- Phase 3: 物流全链路智能 + 平台账单 AI 对账
-- 1. t_ec_logistics_anomaly 物流异常预警表（AI 选物流+异常预警+签收外呼）
-- 2. t_ec_platform_bill 平台账单对账表（平台账单 AI 对账）
-- 幂等：INFORMATION_SCHEMA 检查 + DROP/CREATE PROCEDURE
-- ============================================================

-- ---------- 1. t_ec_logistics_anomaly ----------
DROP PROCEDURE IF EXISTS proc_create_ec_logistics_anomaly;
DELIMITER //
CREATE PROCEDURE proc_create_ec_logistics_anomaly()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES
                   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_ec_logistics_anomaly') THEN
        CREATE TABLE t_ec_logistics_anomaly (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            tenant_id BIGINT NOT NULL COMMENT '租户ID（P0铁律4：多租户隔离）',
            order_id BIGINT NOT NULL COMMENT '电商订单ID',
            order_no VARCHAR(64) NOT NULL COMMENT '电商订单号',
            tracking_no VARCHAR(64) COMMENT '快递单号',
            express_company VARCHAR(32) COMMENT '快递公司',
            receiver_name VARCHAR(64) COMMENT '收货人',
            receiver_phone VARCHAR(32) COMMENT '收货电话',
            anomaly_type VARCHAR(32) NOT NULL COMMENT '异常类型：DELAY/STALE/EXCEPTION/SIGNED_ABNORMAL/RETURN_RISK',
            severity VARCHAR(16) NOT NULL DEFAULT 'MEDIUM' COMMENT '严重度：HIGH/MEDIUM/LOW',
            days_since_update INT DEFAULT 0 COMMENT '距离最后轨迹更新天数',
            last_track_desc VARCHAR(255) COMMENT '最后轨迹描述',
            last_track_time DATETIME COMMENT '最后轨迹时间',
            ai_advice VARCHAR(1024) COMMENT 'AI 处理建议',
            ai_confidence INT COMMENT 'AI 置信度 0-100',
            handled_status INT NOT NULL DEFAULT 0 COMMENT '0未处理/1已处理/2已忽略',
            handled_by VARCHAR(64) COMMENT '处理人',
            handled_time DATETIME COMMENT '处理时间',
            handled_remark VARCHAR(512) COMMENT '处理备注',
            create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            KEY idx_tenant_status (tenant_id, handled_status),
            KEY idx_tenant_type (tenant_id, anomaly_type),
            KEY idx_tenant_order (tenant_id, order_id),
            KEY idx_tracking (tenant_id, tracking_no)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Phase3 物流异常预警（AI 监控在途订单异常）';
    END IF;
END //
DELIMITER ;
CALL proc_create_ec_logistics_anomaly();
DROP PROCEDURE IF EXISTS proc_create_ec_logistics_anomaly;

-- ---------- 2. t_ec_platform_bill ----------
DROP PROCEDURE IF EXISTS proc_create_ec_platform_bill;
DELIMITER //
CREATE PROCEDURE proc_create_ec_platform_bill()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES
                   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_ec_platform_bill') THEN
        CREATE TABLE t_ec_platform_bill (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            tenant_id BIGINT NOT NULL COMMENT '租户ID（P0铁律4）',
            platform VARCHAR(32) NOT NULL COMMENT '平台代码：TAOBAO/JD/PINDUODO/DOUYIN/XIAOHONGSHU...',
            shop_name VARCHAR(128) COMMENT '店铺名称',
            bill_period VARCHAR(32) NOT NULL COMMENT '账期：如 2026-07 或 2026-W27',
            bill_no VARCHAR(64) COMMENT '平台账单号',
            platform_order_no VARCHAR(64) NOT NULL COMMENT '平台原始订单号',
            local_revenue_id BIGINT COMMENT '关联本地收入流水ID（t_ec_sales_revenue.id）',
            local_revenue_no VARCHAR(64) COMMENT '关联本地收入流水号',
            platform_amount DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT '平台账单金额',
            local_amount DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT '本地收入金额',
            diff_amount DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT '差异金额（平台-本地）',
            diff_type VARCHAR(32) NOT NULL DEFAULT 'NONE' COMMENT '差异类型：NONE/MISSING_LOCAL/MISSING_PLATFORM/AMOUNT_MISMATCH',
            ai_analysis VARCHAR(1024) COMMENT 'AI 差异分析',
            ai_confidence INT COMMENT 'AI 置信度 0-100',
            handled_status INT NOT NULL DEFAULT 0 COMMENT '0待处理/1已确认/2已申诉/3已忽略',
            handled_by VARCHAR(64) COMMENT '处理人',
            handled_time DATETIME COMMENT '处理时间',
            fetched_time DATETIME COMMENT '账单拉取时间',
            create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uk_tenant_period_order (tenant_id, platform, bill_period, platform_order_no),
            KEY idx_tenant_status (tenant_id, handled_status),
            KEY idx_tenant_diff (tenant_id, diff_type),
            KEY idx_tenant_period (tenant_id, bill_period)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Phase3 平台账单对账（AI 差异分析）';
    END IF;
END //
DELIMITER ;
CALL proc_create_ec_platform_bill();
DROP PROCEDURE IF EXISTS proc_create_ec_platform_bill;
