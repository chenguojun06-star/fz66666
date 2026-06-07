-- ============================================================
-- V20260304b：创建电商销售收入流水表
-- 触发时机：仓库出库 → EcommerceOrderOrchestrator.onWarehouseOutbound()
--           → EcSalesRevenueOrchestrator.recordOnOutbound()
-- 新接口：
--   POST /api/finance/ec-revenue/list    查询收入流水
--   POST /api/finance/ec-revenue/summary 汇总统计
--   POST /api/finance/ec-revenue/{id}/stage-action?action=confirm   核账
--   POST /api/finance/ec-revenue/{id}/stage-action?action=reconcile 入账
-- ============================================================
CREATE TABLE IF NOT EXISTS t_ec_sales_revenue (
    id                 BIGINT         NOT NULL AUTO_INCREMENT COMMENT '主键',
    revenue_no         VARCHAR(50)    NOT NULL                COMMENT '流水号 REV-{platform}-yyyyMMdd-xxxxx',
    ec_order_id        BIGINT         NOT NULL                COMMENT '关联 t_ecommerce_order.id',
    ec_order_no        VARCHAR(60)    DEFAULT NULL            COMMENT '内部 EC 单号',
    platform_order_no  VARCHAR(120)   DEFAULT NULL            COMMENT '平台原始订单号',
    platform           VARCHAR(20)    DEFAULT NULL            COMMENT '平台代码 TB/JD/PDD/DY/XHS/WC/SFY',
    shop_name          VARCHAR(120)   DEFAULT NULL            COMMENT '店铺名称',
    product_name       VARCHAR(255)   DEFAULT NULL            COMMENT '商品名称',
    sku_code           VARCHAR(120)   DEFAULT NULL            COMMENT 'SKU 码',
    quantity           INT            DEFAULT 0               COMMENT '销售数量',
    unit_price         DECIMAL(12,2)  DEFAULT NULL            COMMENT '商品单价（元/件）',
    total_amount       DECIMAL(14,2)  DEFAULT NULL            COMMENT '商品总金额',
    pay_amount         DECIMAL(14,2)  DEFAULT NULL            COMMENT '买家实付金额（核心收入）',
    freight            DECIMAL(10,2)  DEFAULT NULL            COMMENT '运费',
    discount           DECIMAL(10,2)  DEFAULT NULL            COMMENT '平台优惠折扣',
    production_order_no VARCHAR(60)   DEFAULT NULL            COMMENT '关联生产订单号',
    status             VARCHAR(20)    NOT NULL DEFAULT 'pending'
                                                              COMMENT '状态: pending待确认 / confirmed已核账 / reconciled已入账',
    ship_time          DATETIME       DEFAULT NULL            COMMENT '发货时间',
    complete_time      DATETIME       DEFAULT NULL            COMMENT '买家确认收货时间',
    remark             VARCHAR(500)   DEFAULT NULL            COMMENT '财务备注',
    tenant_id          BIGINT         NOT NULL                COMMENT '租户 ID（多租户隔离）',
    create_time        DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time        DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE  KEY uk_revenue_no      (revenue_no),
    UNIQUE  KEY uk_ec_order_id     (ec_order_id)     COMMENT '同一 EC 订单只产生一条流水（幂等）',
    INDEX   ix_tenant_status       (tenant_id, status),
    INDEX   ix_tenant_platform     (tenant_id, platform),
    INDEX   ix_create_time         (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='电商销售收入流水';
