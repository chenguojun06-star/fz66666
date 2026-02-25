-- ======================== PART 2/6 - 第4段 共4段 ========================

-- ---- V35: add tenant id to pattern scan record ----
-- V35: 修复 t_pattern_scan_record 缺少 tenant_id 列
-- 原因：PatternScanRecord 实体类有 tenantId 字段（@TableField(fill=INSERT)），
--       MyBatisPlusMetaObjectHandler 在 INSERT 时自动填充，但表结构缺少该列，导致
--       INSERT/SELECT 均报 "Unknown column 'tenant_id' in 'field list'"

ALTER TABLE t_pattern_scan_record
    ADD COLUMN tenant_id BIGINT NULL COMMENT '租户ID，多租户数据隔离' AFTER delete_flag;

-- 避免重复创建索引
SET @exist := (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE table_schema = DATABASE()
      AND table_name = 't_pattern_scan_record'
      AND index_name = 'idx_psr_tenant_id'
);
SET @sql = IF(@exist = 0,
    'ALTER TABLE t_pattern_scan_record ADD INDEX idx_psr_tenant_id (tenant_id)',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;



-- ---- V36: create integration tracking tables ----
-- ============================================================
-- V36: 第三方集成跟踪表（支付流水 / 物流运单 / 回调日志）
-- ============================================================

-- 支付流水表
CREATE TABLE IF NOT EXISTS t_payment_record (
    id              BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    tenant_id       BIGINT       NOT NULL                COMMENT '租户ID',
    order_id        VARCHAR(64)  NOT NULL                COMMENT '业务订单号',
    order_type      VARCHAR(32)  NOT NULL DEFAULT 'production' COMMENT '业务类型: production/sample/material',
    channel         VARCHAR(20)  NOT NULL                COMMENT '支付渠道: ALIPAY/WECHAT_PAY',
    amount          BIGINT       NOT NULL                COMMENT '应付金额（分）',
    actual_amount   BIGINT                               COMMENT '实付金额（分，支付成功后回填）',
    status          VARCHAR(20)  NOT NULL DEFAULT 'PENDING' COMMENT '状态: PENDING/SUCCESS/FAILED/REFUNDED/CANCELLED',
    third_party_order_id VARCHAR(128)                    COMMENT '第三方平台交易号',
    pay_url         VARCHAR(512)                         COMMENT '支付跳转链接',
    qr_code         VARCHAR(512)                         COMMENT '二维码内容',
    error_message   VARCHAR(512)                         COMMENT '失败原因',
    paid_time       DATETIME                             COMMENT '实际支付时间',
    created_time    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_time    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_tenant_order (tenant_id, order_id),
    INDEX idx_third_party (third_party_order_id),
    INDEX idx_status (status),
    INDEX idx_created (created_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='支付流水记录';

-- 物流运单表
CREATE TABLE IF NOT EXISTS t_logistics_record (
    id              BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    tenant_id       BIGINT       NOT NULL                COMMENT '租户ID',
    order_id        VARCHAR(64)  NOT NULL                COMMENT '业务订单号',
    company_code    VARCHAR(20)  NOT NULL                COMMENT '快递公司编码: SF/STO',
    company_name    VARCHAR(32)  NOT NULL                COMMENT '快递公司名称',
    tracking_number VARCHAR(64)                          COMMENT '运单号（下单成功后填入）',
    status          VARCHAR(20)  NOT NULL DEFAULT 'CREATED' COMMENT '状态: CREATED/IN_TRANSIT/ARRIVED/DELIVERED/CANCELLED/FAILED',
    sender_name     VARCHAR(64)                          COMMENT '寄件人姓名',
    sender_phone    VARCHAR(20)                          COMMENT '寄件人电话',
    sender_address  VARCHAR(256)                         COMMENT '寄件地址',
    receiver_name   VARCHAR(64)                          COMMENT '收件人姓名',
    receiver_phone  VARCHAR(20)                          COMMENT '收件人电话',
    receiver_address VARCHAR(256)                        COMMENT '收件地址',
    weight          DECIMAL(8,2)                         COMMENT '重量（kg）',
    estimated_fee   BIGINT                               COMMENT '预估运费（分）',
    actual_fee      BIGINT                               COMMENT '实际运费（分，结算后填入）',
    error_message   VARCHAR(512)                         COMMENT '失败原因',
    last_event      VARCHAR(256)                         COMMENT '最新物流事件描述',
    last_event_time DATETIME                             COMMENT '最新物流事件时间',
    delivered_time  DATETIME                             COMMENT '签收时间',
    created_time    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_time    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_tenant_order (tenant_id, order_id),
    INDEX idx_tracking (tracking_number),
    INDEX idx_status (status),
    INDEX idx_created (created_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='物流运单记录';

-- 第三方回调日志表（存储所有原始 Webhook 报文，便于排查问题）
CREATE TABLE IF NOT EXISTS t_integration_callback_log (
    id              BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    type            VARCHAR(20)  NOT NULL                COMMENT '类型: PAYMENT/LOGISTICS',
    channel         VARCHAR(20)  NOT NULL                COMMENT '渠道: ALIPAY/WECHAT_PAY/SF/STO',
    raw_body        MEDIUMTEXT                           COMMENT '原始回调报文',
    headers         TEXT                                 COMMENT '请求头（JSON格式，含签名字段）',
    verified        TINYINT(1)   NOT NULL DEFAULT 0      COMMENT '签名验证是否通过: 0=否 1=是',
    processed       TINYINT(1)   NOT NULL DEFAULT 0      COMMENT '业务处理是否完成: 0=否 1=是',
    related_order_id VARCHAR(64)                         COMMENT '关联业务订单号（解析后填入）',
    error_message   VARCHAR(512)                         COMMENT '处理失败原因',
    created_time    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_type_channel (type, channel),
    INDEX idx_order (related_order_id),
    INDEX idx_verified (verified),
    INDEX idx_created (created_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='第三方回调日志';



-- ---- V3: add defect fields to product warehousing ----
ALTER TABLE t_product_warehousing
  ADD COLUMN defect_category VARCHAR(64) NULL COMMENT '次品类别' AFTER unqualified_image_urls,
  ADD COLUMN defect_remark VARCHAR(500) NULL COMMENT '次品备注' AFTER defect_category;



-- ---- V4: add missing fields for frontend ----
-- V4: 添加前端新增字段支持
-- 创建时间: 2026-01-20
-- 说明: 为支持PC端新增的29个字段，添加数据库字段

-- ==================== 1. 物料采购表 - 添加到货日期 ====================
ALTER TABLE t_material_purchase 
ADD COLUMN expected_arrival_date DATETIME COMMENT '预计到货日期',
ADD COLUMN actual_arrival_date DATETIME COMMENT '实际到货日期';

-- ==================== 2. 物料对账表 - 添加付款和责任人字段 ====================
ALTER TABLE t_material_reconciliation 
ADD COLUMN paid_amount DECIMAL(10,2) DEFAULT 0.00 COMMENT '已付金额',
ADD COLUMN period_start_date DATETIME COMMENT '对账周期开始日期',
ADD COLUMN period_end_date DATETIME COMMENT '对账周期结束日期',
ADD COLUMN reconciliation_operator_id VARCHAR(50) COMMENT '对账人ID',
ADD COLUMN reconciliation_operator_name VARCHAR(50) COMMENT '对账人姓名',
ADD COLUMN audit_operator_id VARCHAR(50) COMMENT '审核人ID',
ADD COLUMN audit_operator_name VARCHAR(50) COMMENT '审核人姓名';

-- ==================== 3. 质检入库表 - 添加质检人员字段 ====================
ALTER TABLE t_product_warehousing 
ADD COLUMN quality_operator_id VARCHAR(50) COMMENT '质检人员ID',
ADD COLUMN quality_operator_name VARCHAR(50) COMMENT '质检人员姓名';

-- ==================== 说明 ====================
-- ProductionOrder表不需要ALTER TABLE，因为新增字段都是通过聚合查询得到的临时字段(@TableField(exist = false))
-- 车缝、大烫、包装环节数据从t_scan_record表聚合
-- 质量统计数据从t_product_warehousing表聚合



-- ---- V5: update flow stage snapshot view ----
-- V5: 更新v_production_order_flow_stage_snapshot视图 - 添加车缝、大烫、包装环节
-- 创建时间: 2026-01-20
-- 说明: 为支持PC端新增的车缝、大烫、包装三个环节的字段，更新视图定义

CREATE OR REPLACE VIEW v_production_order_flow_stage_snapshot AS
SELECT
  sr.order_id AS order_id,
  
  -- ============ 下单环节 ============
  MIN(CASE WHEN sr.scan_type = 'production' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '下单' THEN sr.scan_time END) AS order_start_time,
  MAX(CASE WHEN sr.scan_type = 'production' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '下单' THEN sr.scan_time END) AS order_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'production' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '下单' THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS order_operator_name,
  
  -- ============ 采购环节 ============
  MAX(CASE WHEN sr.scan_type = 'production' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '采购' THEN sr.scan_time END) AS procurement_scan_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'production' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '采购' THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS procurement_scan_operator_name,
  
  -- ============ 裁剪环节 ============
  MIN(CASE WHEN sr.scan_type = 'cutting' THEN sr.scan_time END) AS cutting_start_time,
  MAX(CASE WHEN sr.scan_type = 'cutting' THEN sr.scan_time END) AS cutting_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'cutting' THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS cutting_operator_name,
  SUM(CASE WHEN sr.scan_type = 'cutting' THEN IFNULL(sr.quantity, 0) ELSE 0 END) AS cutting_quantity,
  
  -- ============ 缝制环节 ============
  MIN(CASE WHEN sr.scan_type = 'production'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT IN ('下单', '采购', '车缝', '大烫', '包装')
        AND IFNULL(sr.process_code, '') <> 'quality_warehousing'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%质检%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%检验%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%品检%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%验货%'
      THEN sr.scan_time END) AS sewing_start_time,
  MAX(CASE WHEN sr.scan_type = 'production'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT IN ('下单', '采购', '车缝', '大烫', '包装')
        AND IFNULL(sr.process_code, '') <> 'quality_warehousing'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%质检%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%检验%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%品检%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%验货%'
      THEN sr.scan_time END) AS sewing_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'production'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT IN ('下单', '采购', '车缝', '大烫', '包装')
        AND IFNULL(sr.process_code, '') <> 'quality_warehousing'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%质检%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%检验%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%品检%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%验货%'
      THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS sewing_operator_name,
  
  -- ============ 车缝环节（新增）============
  MIN(CASE WHEN COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '车缝' THEN sr.scan_time END) AS car_sewing_start_time,
  MAX(CASE WHEN COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '车缝' THEN sr.scan_time END) AS car_sewing_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '车缝' THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS car_sewing_operator_name,
  
  -- ============ 大烫环节（新增）============
  MIN(CASE WHEN COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '大烫' THEN sr.scan_time END) AS ironing_start_time,
  MAX(CASE WHEN COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '大烫' THEN sr.scan_time END) AS ironing_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '大烫' THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS ironing_operator_name,
  
  -- ============ 包装环节（新增）============
  MIN(CASE WHEN COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '包装' THEN sr.scan_time END) AS packaging_start_time,
  MAX(CASE WHEN COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '包装' THEN sr.scan_time END) AS packaging_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '包装' THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS packaging_operator_name,
  
  -- ============ 质检环节 ============
  MIN(CASE WHEN (sr.scan_type = 'quality'
        OR IFNULL(sr.process_code, '') = 'quality_warehousing'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%质检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%检验%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%品检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%验货%')
      THEN sr.scan_time END) AS quality_start_time,
  MAX(CASE WHEN (sr.scan_type = 'quality'
        OR IFNULL(sr.process_code, '') = 'quality_warehousing'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%质检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%检验%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%品检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%验货%')
      THEN sr.scan_time END) AS quality_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN (sr.scan_type = 'quality'
        OR IFNULL(sr.process_code, '') = 'quality_warehousing'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%质检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%检验%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%品检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%验货%')
      THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS quality_operator_name,
  SUM(CASE WHEN (sr.scan_type = 'quality'
        OR IFNULL(sr.process_code, '') = 'quality_warehousing'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%质检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%检验%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%品检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%验货%')
      THEN IFNULL(sr.quantity, 0) ELSE 0 END) AS quality_quantity,
  
  -- ============ 入库环节 ============
  MIN(CASE WHEN sr.scan_type = 'warehouse' AND IFNULL(sr.process_code, '') <> 'warehouse_rollback' THEN sr.scan_time END) AS warehousing_start_time,
  MAX(CASE WHEN sr.scan_type = 'warehouse' AND IFNULL(sr.process_code, '') <> 'warehouse_rollback' THEN sr.scan_time END) AS warehousing_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'warehouse' AND IFNULL(sr.process_code, '') <> 'warehouse_rollback' THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS warehousing_operator_name,
  SUM(CASE WHEN sr.scan_type = 'warehouse' AND IFNULL(sr.process_code, '') <> 'warehouse_rollback' THEN IFNULL(sr.quantity, 0) ELSE 0 END) AS warehousing_quantity
FROM t_scan_record sr
WHERE sr.scan_result = 'success'
  AND sr.quantity > 0
GROUP BY sr.order_id;



-- ---- V6: add sku fields to production order ----
-- V6: 补全生产订单表SKU相关字段
-- 创建时间: 2026-01-23
-- 说明: 补全 t_production_order 表中缺失的 color, size, order_details 字段

ALTER TABLE t_production_order
ADD COLUMN color VARCHAR(100) COMMENT '颜色(多色以逗号分隔)',
ADD COLUMN size VARCHAR(100) COMMENT '尺码(多码以逗号分隔)',
ADD COLUMN order_details TEXT COMMENT '订单SKU明细(JSON格式)';



-- ---- V7: create product sku table ----
CREATE TABLE t_product_sku (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    sku_code VARCHAR(64) NOT NULL COMMENT 'SKU编码 (规则: 款号-颜色-尺码)',
    style_id BIGINT NOT NULL COMMENT '关联款号ID',
    style_no VARCHAR(64) NOT NULL COMMENT '款号',
    color VARCHAR(32) NOT NULL COMMENT '颜色',
    size VARCHAR(32) NOT NULL COMMENT '尺码',
    barcode VARCHAR(64) COMMENT '条形码/69码',
    external_sku_id VARCHAR(128) COMMENT '外部电商平台SKU ID',
    external_platform VARCHAR(32) COMMENT '外部平台标识 (如: taobao, shopify)',
    cost_price DECIMAL(10, 2) COMMENT '成本价',
    sales_price DECIMAL(10, 2) COMMENT '销售价',
    status VARCHAR(20) DEFAULT 'ENABLED' COMMENT '状态: ENABLED-启用, DISABLED-禁用',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

    UNIQUE KEY uk_sku_code (sku_code),
    UNIQUE KEY uk_style_color_size (style_id, color, size),
    INDEX idx_external_sku (external_sku_id),
    INDEX idx_style_no (style_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商品SKU主表 (电商对接核心)';



-- ---- V8: add index scan stats ----
-- V8: Add index for Scan SKU optimization
-- 优化扫码进度统计查询性能
CALL _add_idx('t_scan_record', 'idx_scan_stats', 'INDEX `idx_scan_stats` (order_no, scan_result, color, size)');



-- ---- V9: add stock quantity to product sku ----
ALTER TABLE t_product_sku ADD COLUMN stock_quantity INT DEFAULT 0 COMMENT '库存数量';
CREATE INDEX idx_sku_code ON t_product_sku (sku_code);


SELECT 'Part 2 DONE - all migrations applied' AS status;
-- ======================== END PART 2 ========================


SELECT 'Part 2 ALL DONE' AS status;