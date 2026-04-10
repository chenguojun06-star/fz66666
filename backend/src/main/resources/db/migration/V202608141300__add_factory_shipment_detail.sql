-- 外发工厂发货颜色尺码明细表
-- 修复问题：原 t_factory_shipment 只记录总件数，无法区分颜色尺码，导致发货/收货数据对应乱套
CREATE TABLE IF NOT EXISTS t_factory_shipment_detail
(
    id          VARCHAR(64)  NOT NULL PRIMARY KEY,
    shipment_id VARCHAR(64)  NOT NULL,
    color       VARCHAR(50)  NOT NULL DEFAULT '',
    size_name   VARCHAR(50)  NOT NULL DEFAULT '',
    quantity    INT          NOT NULL DEFAULT 0,
    tenant_id   BIGINT,
    create_time DATETIME,
    INDEX idx_shipment_id (shipment_id),
    INDEX idx_tenant_id (tenant_id)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;
